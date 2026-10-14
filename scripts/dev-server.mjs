import { randomUUID } from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import esbuild from 'esbuild';

const root = path.resolve(import.meta.dirname, '..');
const outfile = path.join(root, 'dist', 'dev-handler.cjs');
const port = Number(process.env.PORT || 3000);
const host = '127.0.0.1';

await esbuild.build({
	absWorkingDir: root,
	entryPoints: ['src/handler.ts'],
	bundle: true,
	platform: 'node',
	target: 'node24',
	format: 'cjs',
	outfile,
	sourcemap: true,
});

const { handler } = await import(pathToFileURL(outfile).href);

function headerValue(value) {
	if (Array.isArray(value)) {
		return value.join(',');
	}
	return value;
}

function readBody(req) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		req.on('data', (chunk) => chunks.push(chunk));
		req.on('end', () => resolve(Buffer.concat(chunks)));
		req.on('error', reject);
	});
}

function toEvent(req, body, requestUrl) {
	const headers = {};
	for (const [name, value] of Object.entries(req.headers)) {
		const normalized = headerValue(value);
		if (normalized !== undefined) {
			headers[name] = normalized;
		}
	}
	const rawPath = requestUrl.pathname || '/';
	const rawQueryString = requestUrl.search.startsWith('?')
		? requestUrl.search.slice(1)
		: '';
	return {
		version: '2.0',
		routeKey: '$default',
		rawPath,
		rawQueryString,
		headers,
		body: body.length > 0 ? body.toString('utf8') : undefined,
		isBase64Encoded: false,
		requestContext: {
			accountId: 'local',
			apiId: 'local',
			domainName: host,
			domainPrefix: host,
			requestId: randomUUID(),
			routeKey: '$default',
			stage: '$default',
			time: new Date().toISOString(),
			timeEpoch: Date.now(),
			http: {
				method: req.method || 'GET',
				path: rawPath,
				protocol: 'HTTP/1.1',
				sourceIp: req.socket.remoteAddress || host,
				userAgent: headers['user-agent'] || 'dev-server',
			},
		},
	};
}

function writeResult(res, result) {
	if (typeof result === 'string') {
		res.writeHead(200, {
			'content-type': 'application/json; charset=utf-8',
		});
		res.end(result);
		return;
	}
	const headers = result.headers ?? {};
	for (const [name, value] of Object.entries(headers)) {
		if (value !== undefined && value !== false) {
			res.setHeader(name, String(value));
		}
	}
	const statusCode = result.statusCode ?? 200;
	if (result.isBase64Encoded && result.body) {
		res.writeHead(statusCode);
		res.end(Buffer.from(result.body, 'base64'));
		return;
	}
	res.writeHead(statusCode);
	res.end(result.body ?? '');
}

const server = http.createServer(async (req, res) => {
	try {
		const body = await readBody(req);
		const requestUrl = new URL(req.url || '/', `http://${host}`);
		const result = await handler(toEvent(req, body, requestUrl));
		writeResult(res, result);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Internal error';
		res.writeHead(500, {
			'content-type': 'application/json; charset=utf-8',
		});
		res.end(JSON.stringify({ error: message }));
	}
});

server.listen(port, host, () => {
	process.stdout.write(`easyCMDB API listening on http://${host}:${port}\n`);
});
