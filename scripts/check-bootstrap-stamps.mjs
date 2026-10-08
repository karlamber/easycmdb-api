#!/usr/bin/env node
/**
 * Fail if a landscape `initial-config.sql` is missing any version from
 * db/migrations/. Extra stamps in the bootstrap file are reported as warnings.
 *
 * Usage:
 *   npm run migrate:check-bootstrap -- path/to/initial-config.sql [more.sql ...]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, '..', 'db', 'migrations');

function listMigrationVersions() {
	if (!fs.existsSync(migrationsDir)) {
		return [];
	}
	return fs
		.readdirSync(migrationsDir)
		.filter((name) => name.endsWith('.sql'))
		.sort()
		.map((name) => name.replace(/\.sql$/, ''));
}

function stampsFromBootstrap(sql) {
	const block = sql.match(
		/INSERT\s+INTO\s+argus\.schema_migrations[\s\S]*?;/i,
	);
	if (!block) {
		return [];
	}
	return [...block[0].matchAll(/\('([^']+)'\)/g)].map((m) => m[1]);
}

const files = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));
if (files.length === 0) {
	console.error(
		'Usage: npm run migrate:check-bootstrap -- <initial-config.sql> [...]',
	);
	process.exit(2);
}

const expected = listMigrationVersions();
let failed = false;

for (const file of files) {
	const resolved = path.resolve(file);
	if (!fs.existsSync(resolved)) {
		console.error(`Missing file: ${resolved}`);
		failed = true;
		continue;
	}

	const sql = fs.readFileSync(resolved, 'utf8');
	const found = new Set(stampsFromBootstrap(sql));
	const missing = expected.filter((v) => !found.has(v));
	const extra = [...found].filter((v) => !expected.includes(v));

	console.log(resolved);
	if (missing.length === 0 && extra.length === 0) {
		console.log(`  ok — ${expected.length} stamp(s) match db/migrations/`);
		continue;
	}
	if (missing.length > 0) {
		failed = true;
		console.error('  missing stamps (fold these into the snapshot):');
		for (const version of missing) {
			console.error(`    - ${version}`);
		}
	}
	if (extra.length > 0) {
		console.warn('  extra stamps (not in db/migrations/):');
		for (const version of extra) {
			console.warn(`    - ${version}`);
		}
	}
}

if (failed) {
	console.error(
		'\nCopy the INSERT from `npm run migrate:stamps` into each snapshot.',
	);
	process.exit(1);
}
