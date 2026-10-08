import type { APIGatewayProxyResultV2 } from 'aws-lambda';

import type { NormalizedHttpEvent } from './normalize-event.js';

/**
 * Request ID echoed to clients and included in sanitized error bodies.
 * Prefers the caller-supplied `X-Request-Id`, then API Gateway's requestId.
 */
export function responseRequestId(event: NormalizedHttpEvent): string {
	const client = event.clientRequestId?.trim();
	if (client) {
		return client;
	}
	const aws = event.requestId?.trim();
	if (aws) {
		return aws;
	}
	return 'unknown';
}

export function withResponseRequestId(
	result: APIGatewayProxyResultV2,
	requestId: string,
): APIGatewayProxyResultV2 {
	if (typeof result !== 'object' || result === null) {
		return result;
	}
	const headers =
		'headers' in result && result.headers ? { ...result.headers } : {};
	headers['x-request-id'] = requestId;
	return { ...result, headers };
}
