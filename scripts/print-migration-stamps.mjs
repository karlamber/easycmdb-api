#!/usr/bin/env node
/**
 * Print the INSERT that landscape `initial-config.sql` files must include so a
 * fresh cluster is already stamped and `npm run migrate` is a no-op.
 *
 * Usage:
 *   npm run migrate:stamps
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, '..', 'db', 'migrations');

function listVersions() {
	if (!fs.existsSync(migrationsDir)) {
		return [];
	}
	return fs
		.readdirSync(migrationsDir)
		.filter((name) => name.endsWith('.sql'))
		.sort()
		.map((name) => name.replace(/\.sql$/, ''));
}

const versions = listVersions();
if (versions.length === 0) {
	console.log('-- No migration files found under db/migrations/.');
	process.exit(0);
}

const values = versions.map((v) => `\t('${v}')`).join(',\n');
process.stdout.write(`INSERT INTO argus.schema_migrations (version) VALUES
${values}
ON CONFLICT (version) DO NOTHING;
`);
