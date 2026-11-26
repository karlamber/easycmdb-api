#!/usr/bin/env node
/**
 * Writes openapi.json at the repo root from the code in
 * src/interfaces/http/openapi/. The committed file is for reading and for
 * tools (Swagger UI, Redocly, client generators); the running API serves the
 * same document at GET /api/openapi.json.
 *
 * The file is generated for AUTH_MODE=both, so it lists both auth schemes.
 * A test fails if the committed file drifts from the code: re-run
 * `npm run openapi` after changing routes or schemas.
 *
 * Run: npm run openapi
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import prettier from 'prettier';

const root = fileURLToPath(new URL('..', import.meta.url));
const outFile = fileURLToPath(new URL('../openapi.json', import.meta.url));

// The source is TypeScript with NodeNext `.js` import specifiers, which plain
// Node cannot load. Bundle it in memory with esbuild (already used for the
// Lambda build) and import the result.
const bundled = await build({
	entryPoints: ['src/interfaces/http/openapi/openapi-document.ts'],
	absWorkingDir: root,
	bundle: true,
	platform: 'node',
	format: 'esm',
	target: 'node24',
	write: false,
	logLevel: 'error',
});
const source = bundled.outputFiles[0].text;
const { buildOpenApiDocument } = await import(
	`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
);

const json = JSON.stringify(buildOpenApiDocument('both'), null, '\t');
const config = await prettier.resolveConfig(outFile);
const formatted = await prettier.format(json, {
	...config,
	filepath: outFile,
});
await writeFile(outFile, formatted);
console.log(`Wrote ${outFile}`);
