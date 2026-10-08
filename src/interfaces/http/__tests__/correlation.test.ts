import { describe, expect, it } from 'vitest';

import { responseRequestId, withResponseRequestId } from '../correlation.js';
import type { NormalizedHttpEvent } from '../normalize-event.js';

function makeEvent(
	overrides: Partial<NormalizedHttpEvent> = {},
): NormalizedHttpEvent {
	return {
		method: 'GET',
		path: '/api/applications',
		queryString: undefined,
		headers: {},
		body: null,
		isBase64Encoded: false,
		requestOrigin: undefined,
		requestId: 'aws-req-1',
		clientRequestId: undefined,
		correlationId: undefined,
		sourceIp: '127.0.0.1',
		jwtClaims: null,
		...overrides,
	};
}

describe('responseRequestId', () => {
	it('prefers the client-supplied X-Request-Id', () => {
		expect(
			responseRequestId(
				makeEvent({
					clientRequestId: 'client-req-99',
					requestId: 'aws-req-1',
				}),
			),
		).toBe('client-req-99');
	});

	it('falls back to API Gateway requestId', () => {
		expect(responseRequestId(makeEvent({ requestId: 'aws-req-1' }))).toBe(
			'aws-req-1',
		);
	});

	it('returns unknown when no ids are present', () => {
		expect(responseRequestId(makeEvent({ requestId: undefined }))).toBe(
			'unknown',
		);
	});
});

describe('withResponseRequestId', () => {
	it('adds x-request-id to response headers', () => {
		const result = withResponseRequestId(
			{
				statusCode: 200,
				headers: { 'content-type': 'application/json' },
				body: '{}',
			},
			'client-req-99',
		);
		expect(
			(result as { headers: Record<string, string> }).headers[
				'x-request-id'
			],
		).toBe('client-req-99');
	});
});
