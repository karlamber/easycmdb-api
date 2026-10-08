import type { LogFields, LoggerPort } from './logger.port.js';

/**
 * Dependency-free JSON logger. Writes one record per line to stdout, which
 * Lambda pipes to CloudWatch Logs (works with `log_format = "JSON"`).
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_RANK: Record<Level, number> = {
	debug: 10,
	info: 20,
	warn: 30,
	error: 40,
};

export type LoggerConfig = {
	level?: string;
	service: string;
	env: string;
};

function normalizeLevel(level: string | undefined): Level {
	const lc = (level ?? 'info').toLowerCase();
	switch (lc) {
		case 'debug':
		case 'info':
		case 'warn':
		case 'error':
			return lc;
		case 'trace':
			return 'debug';
		case 'fatal':
			return 'error';
		default:
			return 'info';
	}
}

function serializeError(err: Error): LogFields {
	return {
		type: err.name,
		message: err.message,
		stack: err.stack,
	};
}

function jsonReplacer(_key: string, value: unknown): unknown {
	if (value instanceof Error) {
		return serializeError(value);
	}
	if (typeof value === 'bigint') {
		return value.toString();
	}
	return value;
}

function buildLogger(bindings: LogFields, minRank: number): LoggerPort {
	const emit = (level: Level, message: string, extra?: LogFields): void => {
		if (LEVEL_RANK[level] < minRank) {
			return;
		}
		const entry = {
			level,
			time: new Date().toISOString(),
			msg: message,
			...bindings,
			...(extra ?? {}),
		};
		try {
			process.stdout.write(JSON.stringify(entry, jsonReplacer) + '\n');
		} catch {
			// Never let logging crash the request; emit a minimal fallback.
			process.stdout.write(
				JSON.stringify({
					level: 'error',
					time: new Date().toISOString(),
					msg: 'logger.serialize_failed',
					originalMsg: message,
				}) + '\n',
			);
		}
	};

	return {
		debug(message, fields) {
			emit('debug', message, fields);
		},
		info(message, fields) {
			emit('info', message, fields);
		},
		warn(message, fields) {
			emit('warn', message, fields);
		},
		error(message, errorOrFields, fields) {
			let combined: LogFields | undefined;
			if (errorOrFields instanceof Error) {
				combined = { err: errorOrFields, ...(fields ?? {}) };
			} else if (errorOrFields) {
				combined = errorOrFields;
			}
			emit('error', message, combined);
		},
		child(extra) {
			return buildLogger({ ...bindings, ...extra }, minRank);
		},
	};
}

export function createConsoleLogger(cfg: LoggerConfig): LoggerPort {
	const minRank = LEVEL_RANK[normalizeLevel(cfg.level)];
	return buildLogger({ service: cfg.service, env: cfg.env }, minRank);
}
