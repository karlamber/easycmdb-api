import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { buildOpenApiDocument } from '../openapi-document.js';
import { OPENAPI_OPERATIONS } from '../openapi-operations.js';

const COMMITTED_SPEC_URL = new URL(
	'../../../../../openapi.json',
	import.meta.url,
);

function collectRefs(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value.flatMap(collectRefs);
	}
	if (typeof value === 'object' && value !== null) {
		return Object.entries(value).flatMap(([key, child]) =>
			key === '$ref' && typeof child === 'string'
				? [child]
				: collectRefs(child),
		);
	}
	return [];
}

function resolvePointer(document: unknown, ref: string): unknown {
	return ref
		.replace(/^#\//, '')
		.split('/')
		.reduce<unknown>(
			(node, segment) =>
				typeof node === 'object' && node !== null
					? (node as Record<string, unknown>)[segment]
					: undefined,
			document,
		);
}

describe('buildOpenApiDocument', () => {
	it('given the committed openapi.json, when compared with the code, then they match (run `npm run openapi` if this fails)', () => {
		// Arrange
		const committed: unknown = JSON.parse(
			readFileSync(COMMITTED_SPEC_URL, 'utf8'),
		);

		// Act
		const target = buildOpenApiDocument('both');

		// Assert
		expect(committed).toEqual(target);
	});

	it('given any auth mode, when built, then every $ref points at an existing component', () => {
		for (const mode of ['basic', 'cognito', 'both'] as const) {
			// Arrange
			const target = buildOpenApiDocument(mode);

			// Act
			const dangling = collectRefs(target).filter(
				(ref) => resolvePointer(target, ref) === undefined,
			);

			// Assert
			expect(dangling).toEqual([]);
		}
	});

	it.each([
		['basic', ['basicAuth']],
		['cognito', ['bearerAuth']],
		['both', ['basicAuth', 'bearerAuth']],
	] as const)(
		'given AUTH_MODE=%s, when built, then it advertises exactly %j',
		(mode, expected) => {
			// Act
			const target = buildOpenApiDocument(mode);

			// Assert
			expect(
				Object.keys(target.components.securitySchemes ?? {}),
			).toEqual(expected);
			expect(target.security).toEqual(
				expected.map((name) => ({ [name]: [] })),
			);
		},
	);

	it('given the operation list, when built, then operationIds are unique and every operation is present', () => {
		// Act
		const target = buildOpenApiDocument('both');

		// Assert
		const ids = OPENAPI_OPERATIONS.map((op) => op.operationId);
		expect(new Set(ids).size).toBe(ids.length);
		for (const op of OPENAPI_OPERATIONS) {
			expect(target.paths[op.path]?.[op.method]).toMatchObject({
				operationId: op.operationId,
			});
		}
	});

	it('given /health, when built, then it is the only operation that needs no auth', () => {
		// Act
		const target = buildOpenApiDocument('both');

		// Assert
		const anonymous = Object.values(target.paths)
			.flatMap((item) => Object.values(item))
			.filter(
				(op) => Array.isArray(op.security) && op.security.length === 0,
			)
			.map((op) => op.operationId);
		expect(anonymous).toEqual(['getHealth']);
	});
});
