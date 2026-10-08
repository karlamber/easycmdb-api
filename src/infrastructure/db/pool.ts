import type { AppConfig } from '../../config.js';
import type { LoggerPort } from '../../observability/logger.port.js';
import { Pool, type PoolConfig } from 'pg';

declare global {
	var __argus_pg_pool: Pool | undefined;
}

export function getOrCreatePool(config: AppConfig, logger?: LoggerPort): Pool {
	if (globalThis.__argus_pg_pool) {
		return globalThis.__argus_pg_pool;
	}

	const poolConfig: PoolConfig = {
		host: config.PGHOST,
		port: config.PGPORT,
		user: config.PGUSER,
		password: config.PGPASSWORD,
		database: config.PGDATABASE,
		max: 4,
		idleTimeoutMillis: 10_000,
		connectionTimeoutMillis: 8000,
		options: '-c search_path=argus',
		...(config.PG_SSL
			? { ssl: { rejectUnauthorized: config.PG_SSL_REJECT_UNAUTHORIZED } }
			: {}),
	};

	const pool = new Pool(poolConfig);

	// Listener required: pg emits `error` for asynchronously-failed clients;
	// without a handler the process would crash.
	pool.on('error', (err) => {
		if (logger) {
			logger.error('db.pool_error', err, {
				host: config.PGHOST,
				database: config.PGDATABASE,
			});
		}
	});

	globalThis.__argus_pg_pool = pool;
	return pool;
}
