import type { APIGatewayProxyEvent, APIGatewayProxyEventV2 } from 'aws-lambda';
import { describe, expect, it } from 'vitest';

import { normalizeApiGatewayEvent } from '../normalize-event.js';

function v2EventWithJwt(
	jwtClaims: Record<string, unknown> | undefined,
): APIGatewayProxyEventV2 {
	const authorizer = jwtClaims ? { jwt: { claims: jwtClaims } } : undefined;
	return {
		version: '2.0',
		routeKey: '$default',
		rawPath: '/api/me',
		rawQueryString: '',
		headers: { 'content-type': 'application/json' },
		requestContext: {
			accountId: '123',
			apiId: 'a',
			domainName: 'd',
			domainPrefix: 'p',
			http: {
				method: 'GET',
				path: '/api/me',
				protocol: 'HTTP/1.1',
				sourceIp: '127.0.0.1',
				userAgent: 'test',
			},
			requestId: 'r-1',
			routeKey: '$default',
			stage: '$default',
			time: '',
			timeEpoch: 0,
			...(authorizer ? { authorizer } : {}),
		},
		isBase64Encoded: false,
		body: undefined,
	} as unknown as APIGatewayProxyEventV2;
}

describe('normalizeApiGatewayEvent (HTTP API v2 JWT claim extraction)', () => {
	it('captures jwt claims when the authorizer attached', () => {
		const evt = v2EventWithJwt({
			email: 'jane@example.com',
			'custom:roles': 'argus-admin',
		});
		const normalized = normalizeApiGatewayEvent(evt);
		expect(normalized.jwtClaims).toEqual({
			email: 'jane@example.com',
			'custom:roles': 'argus-admin',
		});
	});

	it('returns null claims when no authorizer ran on the route', () => {
		const evt = v2EventWithJwt(undefined);
		const normalized = normalizeApiGatewayEvent(evt);
		expect(normalized.jwtClaims).toBeNull();
	});

	it('captures client correlation headers from HTTP API v2 events', () => {
		const evt = v2EventWithJwt(undefined);
		evt.headers = {
			'x-request-id': ' client-req-1 ',
			'X-Correlation-Id': 'session-abc',
		};
		const normalized = normalizeApiGatewayEvent(evt);
		expect(normalized.clientRequestId).toBe('client-req-1');
		expect(normalized.correlationId).toBe('session-abc');
	});

	it('returns null claims for REST API v1 events', () => {
		const evt: APIGatewayProxyEvent = {
			httpMethod: 'GET',
			path: '/api/me',
			headers: {},
			body: null,
			isBase64Encoded: false,
			queryStringParameters: null,
			requestContext: { requestId: 'r-1' },
		} as unknown as APIGatewayProxyEvent;
		const normalized = normalizeApiGatewayEvent(evt);
		expect(normalized.jwtClaims).toBeNull();
	});
});
