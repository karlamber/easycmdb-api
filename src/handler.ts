import type {
	APIGatewayProxyEvent,
	APIGatewayProxyEventV2,
	APIGatewayProxyResultV2,
} from 'aws-lambda';
import { loadConfig } from './config.js';
import { ApplicationCrudService } from './application/application-crud.service.js';
import { HostingProviderCrudService } from './application/hosting-provider-crud.service.js';
import { LandscapeCrudService } from './application/landscape-crud.service.js';
import { LandscapeEnvironmentCrudService } from './application/landscape-environment-crud.service.js';
import { ResourceCrudService } from './application/resource-crud.service.js';
import { getOrCreatePool } from './infrastructure/db/pool.js';
import { PgApplicationRepository } from './infrastructure/repositories/application.pg-repository.js';
import { PgHostingProviderRepository } from './infrastructure/repositories/hosting-provider.pg-repository.js';
import { PgLandscapeEnvironmentRepository } from './infrastructure/repositories/landscape-environment.pg-repository.js';
import { PgLandscapeRepository } from './infrastructure/repositories/landscape.pg-repository.js';
import { PgResourceRepository } from './infrastructure/repositories/resource.pg-repository.js';
import {
	responseRequestId,
	withResponseRequestId,
} from './interfaces/http/correlation.js';
import { routeHttp, type RouterDeps } from './interfaces/http/api-router.js';
import {
	normalizeApiGatewayEvent,
	type NormalizedHttpEvent,
} from './interfaces/http/normalize-event.js';
import { createConsoleLogger } from './observability/console-logger.js';
import type { LoggerPort, LogFields } from './observability/logger.port.js';

type CachedDeps = Omit<RouterDeps, 'logger'> & { baseLogger: LoggerPort };

let cachedDeps: CachedDeps | undefined;

function getDeps(): CachedDeps {
	if (cachedDeps) {
		return cachedDeps;
	}
	const config = loadConfig();
	const baseLogger = createConsoleLogger({
		service: config.SERVICE_NAME,
		env: config.ENV_NAME,
		level: config.LOG_LEVEL,
	});
	const pool = getOrCreatePool(config, baseLogger);
	const hostingProviders = new HostingProviderCrudService(
		new PgHostingProviderRepository(pool),
	);
	cachedDeps = {
		config,
		applications: new ApplicationCrudService(
			new PgApplicationRepository(pool),
		),
		landscapes: new LandscapeCrudService(new PgLandscapeRepository(pool)),
		landscapeEnvironments: new LandscapeEnvironmentCrudService(
			new PgLandscapeEnvironmentRepository(pool),
			hostingProviders,
		),
		resources: new ResourceCrudService(new PgResourceRepository(pool)),
		hostingProviders,
		baseLogger,
	};
	baseLogger.info('handler.initialized');
	return cachedDeps;
}

function statusOf(result: APIGatewayProxyResultV2): number | undefined {
	if (
		typeof result === 'object' &&
		result !== null &&
		'statusCode' in result
	) {
		return result.statusCode;
	}
	return undefined;
}

function requestLoggerBindings(normalized: NormalizedHttpEvent): LogFields {
	const bindings: LogFields = {
		requestId: normalized.requestId,
		sourceIp: normalized.sourceIp,
		method: normalized.method,
		path: normalized.path,
	};
	if (normalized.clientRequestId) {
		bindings.clientRequestId = normalized.clientRequestId;
	}
	if (normalized.correlationId) {
		bindings.correlationId = normalized.correlationId;
	}
	return bindings;
}

function internalServerErrorResponse(
	requestId: string | undefined,
): APIGatewayProxyResultV2 {
	const headers: Record<string, string> = {
		'content-type': 'application/json; charset=utf-8',
	};
	if (requestId) {
		headers['x-request-id'] = requestId;
	}
	return {
		statusCode: 500,
		headers,
		body: JSON.stringify({
			error: 'Internal server error',
			...(requestId ? { requestId } : {}),
		}),
	};
}

export async function handler(
	event: APIGatewayProxyEventV2 | APIGatewayProxyEvent,
): Promise<APIGatewayProxyResultV2> {
	const startedAt = Date.now();
	let requestLogger: LoggerPort | undefined;
	let normalized: NormalizedHttpEvent | undefined;
	try {
		const deps = getDeps();
		normalized = normalizeApiGatewayEvent(event);
		requestLogger = deps.baseLogger.child(
			requestLoggerBindings(normalized),
		);
		requestLogger.info('request.received', {
			queryString: normalized.queryString,
			origin: normalized.requestOrigin,
		});

		const result = await routeHttp(normalized, {
			config: deps.config,
			applications: deps.applications,
			landscapes: deps.landscapes,
			landscapeEnvironments: deps.landscapeEnvironments,
			resources: deps.resources,
			hostingProviders: deps.hostingProviders,
			logger: requestLogger,
		});

		requestLogger.info('request.completed', {
			statusCode: statusOf(result),
			durationMs: Date.now() - startedAt,
		});
		return withResponseRequestId(result, responseRequestId(normalized));
	} catch (err) {
		const wrapped =
			err instanceof Error ? err : new Error('Internal error');
		const durationMs = Date.now() - startedAt;
		const echoRequestId = normalized
			? responseRequestId(normalized)
			: undefined;
		if (requestLogger) {
			requestLogger.error('handler.unhandled_error', wrapped, {
				durationMs,
			});
		} else {
			// Bootstrap failure (typically config parsing); emit a raw JSON
			// line so the error still reaches CloudWatch.
			process.stdout.write(
				JSON.stringify({
					level: 'error',
					time: new Date().toISOString(),
					msg: 'handler.bootstrap_error',
					durationMs,
					err: {
						type: wrapped.name,
						message: wrapped.message,
						stack: wrapped.stack,
					},
				}) + '\n',
			);
		}
		return internalServerErrorResponse(echoRequestId);
	}
}
