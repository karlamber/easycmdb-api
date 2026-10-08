import type { APIGatewayProxyEvent, APIGatewayProxyEventV2 } from 'aws-lambda';

import type { JwtClaims } from './jwt-auth.js';

export type NormalizedHttpEvent = {
	method: string;
	path: string;
	queryString: string | undefined;
	headers: Record<string, string | undefined>;
	body: string | null;
	isBase64Encoded: boolean;
	requestOrigin: string | undefined;
	requestId: string | undefined;
	/** Caller-supplied `X-Request-Id` header, when present. */
	clientRequestId: string | undefined;
	/** Caller-supplied `X-Correlation-Id` header, when present. */
	correlationId: string | undefined;
	sourceIp: string | undefined;
	/**
	 * JWT claims forwarded by an API Gateway HTTP API JWT authorizer attached
	 * to the matched route. Null when the route has no authorizer (e.g. during
	 * the phased rollout while basic-auth still owns most routes) or when the
	 * event came from API Gateway REST API v1.
	 */
	jwtClaims: JwtClaims | null;
};

function lowerKeyHeaders(
	headers:
		APIGatewayProxyEvent['headers'] | APIGatewayProxyEventV2['headers'],
): Record<string, string | undefined> {
	const out: Record<string, string | undefined> = {};
	if (!headers) {
		return out;
	}
	for (const [k, v] of Object.entries(headers)) {
		out[k.toLowerCase()] = v;
	}
	return out;
}

function optionalHeader(
	headers: Record<string, string | undefined>,
	name: string,
): string | undefined {
	const value = headers[name]?.trim();
	return value || undefined;
}

export function normalizeApiGatewayEvent(event: unknown): NormalizedHttpEvent {
	if (isHttpApiV2(event)) {
		const headers = lowerKeyHeaders(event.headers);
		return {
			method: event.requestContext.http.method,
			path: event.rawPath,
			queryString: event.rawQueryString,
			headers,
			body: event.body ?? null,
			isBase64Encoded: Boolean(event.isBase64Encoded),
			requestOrigin: headers['origin'],
			requestId: event.requestContext.requestId,
			clientRequestId: optionalHeader(headers, 'x-request-id'),
			correlationId: optionalHeader(headers, 'x-correlation-id'),
			sourceIp: event.requestContext.http.sourceIp,
			jwtClaims: extractJwtClaimsV2(event),
		};
	}

	const e = event as APIGatewayProxyEvent;
	const headers = lowerKeyHeaders(e.headers);
	const qs =
		e.queryStringParameters &&
		Object.keys(e.queryStringParameters).length > 0
			? new URLSearchParams(
					e.queryStringParameters as Record<string, string>,
				).toString()
			: undefined;

	return {
		method: e.httpMethod,
		path: e.path,
		queryString: qs,
		headers,
		body: e.body ?? null,
		isBase64Encoded: Boolean(e.isBase64Encoded),
		requestOrigin: headers['origin'],
		requestId: e.requestContext?.requestId,
		clientRequestId: optionalHeader(headers, 'x-request-id'),
		correlationId: optionalHeader(headers, 'x-correlation-id'),
		sourceIp: e.requestContext?.identity?.sourceIp,
		// REST API v1 doesn't carry a JWT authorizer in the same shape as v2.
		// We're only deploying v2, so v1 events get null and fall back to
		// whatever non-JWT auth is configured (i.e. basic).
		jwtClaims: null,
	};
}

/**
 * Pull JWT claims out of an HTTP API v2 event when a JWT authorizer is
 * attached to the matched route. Returns null when no authorizer ran (no
 * `authorizer.jwt` block) - this lets the caller cleanly fall through to
 * basic-auth during the phased rollout. The cast is unavoidable: the v2
 * event type from `@types/aws-lambda` does not parameterise the authorizer
 * shape, but the runtime payload is exactly what AWS documents.
 */
function extractJwtClaimsV2(event: APIGatewayProxyEventV2): JwtClaims | null {
	const auth = (
		event.requestContext as unknown as {
			authorizer?: { jwt?: { claims?: Record<string, unknown> } };
		}
	).authorizer;
	const claims = auth?.jwt?.claims;
	if (claims && typeof claims === 'object') {
		return claims;
	}
	return null;
}

function isHttpApiV2(event: unknown): event is APIGatewayProxyEventV2 {
	return (
		typeof event === 'object' &&
		event !== null &&
		'version' in event &&
		(event as APIGatewayProxyEventV2).version === '2.0' &&
		'rawPath' in event
	);
}

export function decodeBody(event: NormalizedHttpEvent): string {
	if (event.body == null) {
		return '';
	}
	if (event.isBase64Encoded) {
		return Buffer.from(event.body, 'base64').toString('utf8');
	}
	return event.body;
}

export function stripApiPrefix(path: string): string {
	let p = path.replace(/\/$/, '') || '/';
	if (p.startsWith('/api')) {
		p = p.slice(4) || '/';
	}
	return p;
}
