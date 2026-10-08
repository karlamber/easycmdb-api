#!/usr/bin/env node
/**
 * Apply pending SQL migrations from db/migrations/ in lexical order.
 *
 * Tracks applied versions in argus.schema_migrations. Uses the same PG_*
 * environment variables as the Lambda runtime (see src/config.ts).
 *
 * Usage:
 *   npm run migrate          # apply pending migrations
 *   npm run migrate:status   # list applied vs pending
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, '..', 'db', 'migrations');

function requiredEnv(name) {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`);
	}
	return value;
}

function createPool() {
	const ssl = process.env.PG_SSL === 'true';
	return new Pool({
		host: requiredEnv('PGHOST'),
		port: Number(process.env.PGPORT ?? 5432),
		user: requiredEnv('PGUSER'),
		password: requiredEnv('PGPASSWORD'),
		database: requiredEnv('PGDATABASE'),
		...(ssl
			? {
					ssl: {
						rejectUnauthorized:
							process.env.PG_SSL_REJECT_UNAUTHORIZED !== 'false',
					},
				}
			: {}),
	});
}

async function ensureMigrationsTable(client) {
	await client.query(`
		CREATE TABLE IF NOT EXISTS argus.schema_migrations (
			version text PRIMARY KEY,
			applied_at timestamptz NOT NULL DEFAULT now()
		)
	`);
}

async function listMigrationFiles() {
	if (!fs.existsSync(migrationsDir)) {
		return [];
	}
	return fs
		.readdirSync(migrationsDir)
		.filter((name) => name.endsWith('.sql'))
		.sort();
}

async function getAppliedVersions(client) {
	const res = await client.query(
		'SELECT version FROM argus.schema_migrations ORDER BY version',
	);
	return new Set(res.rows.map((row) => row.version));
}

async function showStatus(client) {
	const files = await listMigrationFiles();
	const applied = await getAppliedVersions(client);
	for (const file of files) {
		const version = file.replace(/\.sql$/, '');
		const mark = applied.has(version) ? 'applied' : 'pending';
		console.log(`${mark.padEnd(8)} ${file}`);
	}
}

async function applyPending(client) {
	const files = await listMigrationFiles();
	if (files.length === 0) {
		console.log('No migration files found.');
		return;
	}

	const applied = await getAppliedVersions(client);
	let count = 0;

	for (const file of files) {
		const version = file.replace(/\.sql$/, '');
		if (applied.has(version)) {
			continue;
		}

		const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
		console.log(`Applying ${file}...`);
		await client.query('BEGIN');
		try {
			await client.query(sql);
			await client.query(
				'INSERT INTO argus.schema_migrations (version) VALUES ($1)',
				[version],
			);
			await client.query('COMMIT');
			console.log(`Applied ${file}`);
			count += 1;
		} catch (err) {
			await client.query('ROLLBACK');
			throw err;
		}
	}

	if (count === 0) {
		console.log('Database is up to date.');
	} else {
		console.log(`Applied ${count} migration(s).`);
	}
}

async function main() {
	const statusOnly = process.argv.includes('--status');
	const pool = createPool();
	const client = await pool.connect();

	try {
		await client.query('SET search_path TO argus');
		await ensureMigrationsTable(client);

		if (statusOnly) {
			await showStatus(client);
			return;
		}

		await applyPending(client);
	} finally {
		client.release();
		await pool.end();
	}
}

main().catch((err) => {
	console.error(err instanceof Error ? err.message : err);
	process.exit(1);
});
