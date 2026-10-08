import { describe, expect, it, vi } from 'vitest';

import type { AppConfig } from '../../../config.js';
import type { LoggerPort } from '../../../observability/logger.port.js';
import { routeHttp, type RouterDeps } from '../api-router.js';
import type { NormalizedHttpEvent } from '../normalize-event.js';

const APP_ROW = {
	id: '1',
	app_alias: 'sample',
	business_name: null,
	description: null,
	data_class: null,
	compliance: [] as string[],
	business_contact: null,
	development_contact: null,
	support_contact: null,
	source_repository: null,
	prod_url: null,
	runbook_url: null,
	is_active: true,
	created_at: '2026-01-01T00:00:00Z',
	updated_at: '2026-01-01T00:00:00Z',
	created_by: null,
	updated_by: null,
	deleted_by: null,
};

function silentLogger(): LoggerPort {
	const noop = () => {};
	const logger: LoggerPort = {
		debug: noop,
		info: noop,
		warn: noop,
		error: noop,
		child: () => logger,
	};
	return logger;
}

function capturingLogger(): {
	logger: LoggerPort;
	entries: Array<{ level: string; message: string; fields?: unknown }>;
} {
	const entries: Array<{
		level: string;
		message: string;
		fields?: unknown;
	}> = [];
	const logger: LoggerPort = {
		debug: (message, fields) =>
			entries.push({ level: 'debug', message, fields }),
		info: (message, fields) =>
			entries.push({ level: 'info', message, fields }),
		warn: (message, fields) =>
			entries.push({ level: 'warn', message, fields }),
		error: (message, errorOrFields, fields) => {
			if (errorOrFields instanceof Error) {
				entries.push({
					level: 'error',
					message,
					fields: { err: errorOrFields, ...(fields ?? {}) },
				});
				return;
			}
			entries.push({
				level: 'error',
				message,
				fields: errorOrFields ?? fields,
			});
		},
		child: () => logger,
	};
	return { logger, entries };
}

function configFor(
	mode: AppConfig['AUTH_MODE'],
	overrides: Partial<AppConfig> = {},
): AppConfig {
	return {
		PGHOST: 'h',
		PGPORT: 5432,
		PGUSER: 'u',
		PGPASSWORD: 'p',
		PGDATABASE: 'd',
		PG_SSL: false,
		PG_SSL_REJECT_UNAUTHORIZED: true,
		AUTH_MODE: mode,
		BASIC_AUTH_USER: 'viewer',
		BASIC_AUTH_PASSWORD: 'viewer-pw',
		BASIC_AUTH_ADMIN_USER: 'admin',
		BASIC_AUTH_ADMIN_PASSWORD: 'admin-pw',
		ADMIN_ROLE_CLAIM_VALUE: 'argus-admin',
		APP_EDIT_ROLE_CLAIM_VALUE: 'argus-app-edit',
		VIEWER_ROLE_CLAIM_VALUE: 'argus-viewer',
		LOG_LEVEL: 'info',
		SERVICE_NAME: 'easycmdb-api',
		ENV_NAME: 'test',
		...overrides,
	} as AppConfig;
}

function makeDeps(
	mode: AppConfig['AUTH_MODE'],
	overrides: Partial<AppConfig> = {},
): RouterDeps {
	return {
		config: configFor(mode, overrides),
		applications: {
			list: vi.fn(async () => [APP_ROW]),
			getById: vi.fn(async () => APP_ROW),
			create: vi.fn(async () => APP_ROW),
			update: vi.fn(async () => APP_ROW),
			softDelete: vi.fn(async () => undefined),
		} as unknown as RouterDeps['applications'],
		landscapes: {} as RouterDeps['landscapes'],
		landscapeEnvironments: {} as RouterDeps['landscapeEnvironments'],
		resources: {} as RouterDeps['resources'],
		hostingProviders: {} as RouterDeps['hostingProviders'],
		logger: silentLogger(),
	};
}

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
		requestId: 'req-1',
		clientRequestId: undefined,
		correlationId: undefined,
		sourceIp: '127.0.0.1',
		jwtClaims: null,
		...overrides,
	};
}

function basic(user: string, password: string): string {
	return `Basic ${Buffer.from(`${user}:${password}`, 'utf8').toString('base64')}`;
}

function parseBody(result: unknown): unknown {
	if (
		typeof result === 'object' &&
		result !== null &&
		'body' in result &&
		typeof (result as { body: unknown }).body === 'string'
	) {
		return JSON.parse((result as { body: string }).body);
	}
	return undefined;
}

function statusOf(result: unknown): number | undefined {
	if (
		typeof result === 'object' &&
		result !== null &&
		'statusCode' in result
	) {
		return (result as { statusCode: number }).statusCode;
	}
	return undefined;
}

describe('routeHttp - public routes (auth bypassed)', () => {
	it('GET /api/health is anonymous in every auth mode', async () => {
		for (const mode of ['basic', 'cognito', 'both'] as const) {
			const result = await routeHttp(
				makeEvent({ path: '/api/health' }),
				makeDeps(mode),
			);
			expect(statusOf(result)).toBe(200);
		}
	});

	it('OPTIONS preflight is anonymous in every auth mode', async () => {
		for (const mode of ['basic', 'cognito', 'both'] as const) {
			const result = await routeHttp(
				makeEvent({ method: 'OPTIONS' }),
				makeDeps(mode),
			);
			expect(statusOf(result)).toBe(204);
		}
	});
});

describe('routeHttp - AUTH_MODE=basic', () => {
	it('accepts a valid Basic credential', async () => {
		const result = await routeHttp(
			makeEvent({
				headers: { authorization: basic('viewer', 'viewer-pw') },
			}),
			makeDeps('basic'),
		);
		expect(statusOf(result)).toBe(200);
	});

	it('rejects with 401 + WWW-Authenticate when credentials are bad', async () => {
		const result = await routeHttp(
			makeEvent({ headers: { authorization: basic('viewer', 'wrong') } }),
			makeDeps('basic'),
		);
		expect(statusOf(result)).toBe(401);
		expect(
			(result as { headers: Record<string, string> }).headers[
				'www-authenticate'
			],
		).toContain('Basic');
	});

	it('ignores JWT claims when AUTH_MODE=basic', async () => {
		const result = await routeHttp(
			makeEvent({
				jwtClaims: { email: 'jane@example.com' },
			}),
			makeDeps('basic'),
		);
		// No Basic header, JWT claims rejected -> 401
		expect(statusOf(result)).toBe(401);
	});
});

describe('routeHttp - AUTH_MODE=cognito', () => {
	it('accepts an identity built from JWT claims', async () => {
		const result = await routeHttp(
			makeEvent({
				jwtClaims: { email: 'jane@example.com' },
			}),
			makeDeps('cognito'),
		);
		expect(statusOf(result)).toBe(200);
	});

	it('rejects with 401 and NO WWW-Authenticate Basic prompt when claims are missing', async () => {
		const result = await routeHttp(makeEvent(), makeDeps('cognito'));
		expect(statusOf(result)).toBe(401);
		expect(
			(result as { headers: Record<string, string> }).headers[
				'www-authenticate'
			],
		).toBeUndefined();
	});

	it('ignores Basic credentials when AUTH_MODE=cognito', async () => {
		const result = await routeHttp(
			makeEvent({
				headers: { authorization: basic('viewer', 'viewer-pw') },
			}),
			makeDeps('cognito'),
		);
		expect(statusOf(result)).toBe(401);
	});

	it('returns 403 INSUFFICIENT_ROLE when JWT-derived viewer tries to write', async () => {
		const result = await routeHttp(
			makeEvent({
				method: 'POST',
				path: '/api/applications',
				body: JSON.stringify({ app_alias: 'new-app' }),
				jwtClaims: { email: 'viewer@example.com' },
			}),
			makeDeps('cognito'),
		);
		expect(statusOf(result)).toBe(403);
		expect(parseBody(result)).toMatchObject({
			code: 'INSUFFICIENT_ROLE',
		});
	});

	it('permits writes when the JWT identity is admin via custom:roles', async () => {
		const deps = makeDeps('cognito');
		const result = await routeHttp(
			makeEvent({
				method: 'POST',
				path: '/api/applications',
				body: JSON.stringify({ app_alias: 'new-app' }),
				jwtClaims: {
					email: 'admin@example.com',
					'custom:roles': 'argus-admin',
				},
			}),
			deps,
		);
		expect(statusOf(result)).toBe(201);
		expect(deps.applications.create).toHaveBeenCalledOnce();
	});

	it('permits app_editor to create an Application', async () => {
		const deps = makeDeps('cognito');
		const result = await routeHttp(
			makeEvent({
				method: 'POST',
				path: '/api/applications',
				body: JSON.stringify({ app_alias: 'new-app' }),
				jwtClaims: {
					email: 'app-owner@example.com',
					'custom:roles': 'argus-app-edit',
				},
			}),
			deps,
		);
		expect(statusOf(result)).toBe(201);
		expect(deps.applications.create).toHaveBeenCalledOnce();
	});

	it('permits app_editor to PATCH and DELETE Applications', async () => {
		const patchDeps = makeDeps('cognito');
		const patchResult = await routeHttp(
			makeEvent({
				method: 'PATCH',
				path: '/api/applications/1',
				body: JSON.stringify({ business_name: 'renamed' }),
				jwtClaims: {
					email: 'app-owner@example.com',
					'custom:roles': 'argus-app-edit',
				},
			}),
			patchDeps,
		);
		expect(statusOf(patchResult)).toBe(200);
		expect(patchDeps.applications.update).toHaveBeenCalledOnce();

		const deleteDeps = makeDeps('cognito');
		const deleteResult = await routeHttp(
			makeEvent({
				method: 'DELETE',
				path: '/api/applications/1',
				jwtClaims: {
					email: 'app-owner@example.com',
					'custom:roles': 'argus-app-edit',
				},
			}),
			deleteDeps,
		);
		expect(statusOf(deleteResult)).toBe(204);
		expect(deleteDeps.applications.softDelete).toHaveBeenCalledOnce();
	});

	it('forbids app_editor from writing to non-Application resources', async () => {
		// Confirms the role is *not* a back-door admin: writes to other
		// resources are rejected with the same INSUFFICIENT_ROLE code we use
		// for viewers, and the service layer is never invoked.
		const deps = makeDeps('cognito');
		for (const path of [
			'/api/landscapes',
			'/api/landscape-environments',
			'/api/resources',
		]) {
			const result = await routeHttp(
				makeEvent({
					method: 'POST',
					path,
					body: JSON.stringify({}),
					jwtClaims: {
						email: 'app-owner@example.com',
						'custom:roles': 'argus-app-edit',
					},
				}),
				deps,
			);
			expect(statusOf(result)).toBe(403);
			expect(parseBody(result)).toMatchObject({
				code: 'INSUFFICIENT_ROLE',
			});
		}
	});

	it('permits app_editor to GET non-Application resources (read-only fallthrough)', async () => {
		// Reads remain open to any authenticated user regardless of role,
		// so an app_editor can still browse Landscapes etc. via the
		// Discover pages. The list service for landscapes isn't stubbed in
		// these tests, but the router gets that far without 403'ing, which
		// is the only thing this case proves.
		const deps = makeDeps('cognito');
		deps.landscapes = {
			list: vi.fn(async () => []),
			getById: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
			softDelete: vi.fn(),
		} as unknown as RouterDeps['landscapes'];
		const result = await routeHttp(
			makeEvent({
				method: 'GET',
				path: '/api/landscapes',
				jwtClaims: {
					email: 'app-owner@example.com',
					'custom:roles': 'argus-app-edit',
				},
			}),
			deps,
		);
		expect(statusOf(result)).toBe(200);
	});
});

describe('routeHttp - AUTH_MODE=both', () => {
	it('prefers JWT claims when both are present (claims-derived admin wins)', async () => {
		const deps = makeDeps('both');
		const result = await routeHttp(
			makeEvent({
				method: 'POST',
				path: '/api/applications',
				body: JSON.stringify({ app_alias: 'new-app' }),
				headers: {
					// Basic 'viewer' credentials would normally only grant read.
					authorization: basic('viewer', 'viewer-pw'),
				},
				jwtClaims: {
					email: 'admin@example.com',
					'custom:roles': 'argus-admin',
				},
			}),
			deps,
		);
		expect(statusOf(result)).toBe(201);
		expect(deps.applications.create).toHaveBeenCalledOnce();
	});

	it('falls back to Basic when JWT claims are absent (rollout pass-through)', async () => {
		const result = await routeHttp(
			makeEvent({
				headers: { authorization: basic('admin', 'admin-pw') },
			}),
			makeDeps('both'),
		);
		expect(statusOf(result)).toBe(200);
	});

	it('returns 401 when neither auth method succeeds', async () => {
		const result = await routeHttp(makeEvent(), makeDeps('both'));
		expect(statusOf(result)).toBe(401);
	});

	it('does NOT send WWW-Authenticate: Basic when the request used a Bearer token', async () => {
		// The Bearer token landed in the Lambda without API Gateway populating
		// jwtClaims (e.g. the JWT authorizer wasn't enabled on the route, or it
		// rejected the token before reaching us). We must not trigger the
		// browser's native Basic-auth dialog in that case - the SPA's HTTP
		// layer will handle the 401 via its own refresh logic instead.
		const result = await routeHttp(
			makeEvent({
				headers: { authorization: 'Bearer not-a-real-token' },
			}),
			makeDeps('both'),
		);
		expect(statusOf(result)).toBe(401);
		expect(
			(result as { headers: Record<string, string> }).headers[
				'www-authenticate'
			],
		).toBeUndefined();
	});

	it('does NOT send WWW-Authenticate: Basic when the request had no auth header', async () => {
		// Same reasoning as Bearer: a caller who did not attempt Basic must
		// not be prompted for Basic. Browser fetches with no Authorization
		// header would otherwise pop the dialog the moment a guarded route is
		// hit.
		const result = await routeHttp(makeEvent(), makeDeps('both'));
		expect(statusOf(result)).toBe(401);
		expect(
			(result as { headers: Record<string, string> }).headers[
				'www-authenticate'
			],
		).toBeUndefined();
	});
});

describe('routeHttp - audit and identity logging', () => {
	it('logs request.authenticated and audit.mutation on successful create', async () => {
		const { logger, entries } = capturingLogger();
		const deps = makeDeps('cognito');
		deps.logger = logger;

		const result = await routeHttp(
			makeEvent({
				method: 'POST',
				path: '/api/applications',
				body: JSON.stringify({ app_alias: 'new-app' }),
				jwtClaims: {
					email: 'admin@example.com',
					'custom:roles': 'argus-admin',
				},
			}),
			deps,
		);

		expect(statusOf(result)).toBe(201);
		expect(deps.applications.create).toHaveBeenCalledWith(
			expect.objectContaining({ app_alias: 'new-app' }),
			'admin@example.com',
		);
		expect(entries.some((e) => e.message === 'request.authenticated')).toBe(
			true,
		);
		expect(entries).toContainEqual(
			expect.objectContaining({
				level: 'info',
				message: 'audit.mutation',
				fields: {
					action: 'create',
					entity: 'application',
					entityId: '1',
				},
			}),
		);
	});

	it('returns a sanitized 500 with requestId instead of internal error text', async () => {
		const deps = makeDeps('cognito');
		deps.applications.create = vi.fn(async () => {
			throw new Error('relation "application" does not exist');
		});

		const result = await routeHttp(
			makeEvent({
				method: 'POST',
				path: '/api/applications',
				body: JSON.stringify({ app_alias: 'new-app' }),
				clientRequestId: 'client-req-42',
				jwtClaims: {
					email: 'admin@example.com',
					'custom:roles': 'argus-admin',
				},
			}),
			deps,
		);

		expect(statusOf(result)).toBe(500);
		expect(parseBody(result)).toEqual({
			error: 'Internal server error',
			requestId: 'client-req-42',
		});
	});
});

describe('routeHttp - /api/me reflects the resolved identity', () => {
	it('reports the role derived from the JWT in cognito mode', async () => {
		const result = await routeHttp(
			makeEvent({
				path: '/api/me',
				jwtClaims: {
					email: 'jane@example.com',
					'custom:roles': 'argus-admin',
				},
			}),
			makeDeps('cognito'),
		);
		expect(statusOf(result)).toBe(200);
		expect(parseBody(result)).toEqual({
			user: 'jane@example.com',
			role: 'admin',
		});
	});

	it('reports app_editor when the JWT carries the app-edit claim', async () => {
		const result = await routeHttp(
			makeEvent({
				path: '/api/me',
				jwtClaims: {
					email: 'app-owner@example.com',
					'custom:roles': 'argus-app-edit',
				},
			}),
			makeDeps('cognito'),
		);
		expect(statusOf(result)).toBe(200);
		expect(parseBody(result)).toEqual({
			user: 'app-owner@example.com',
			role: 'app_editor',
		});
	});

	it('reports the role derived from Basic in basic mode', async () => {
		const result = await routeHttp(
			makeEvent({
				path: '/api/me',
				headers: { authorization: basic('admin', 'admin-pw') },
			}),
			makeDeps('basic'),
		);
		expect(statusOf(result)).toBe(200);
		expect(parseBody(result)).toEqual({ user: 'admin', role: 'admin' });
	});
});

describe('routeHttp - Application compliance tags', () => {
	function adminClaims(): Record<string, unknown> {
		return {
			email: 'admin@example.com',
			'custom:roles': 'argus-admin',
		};
	}

	it('forwards a de-duplicated compliance array to the service on create', async () => {
		const deps = makeDeps('cognito');
		const result = await routeHttp(
			makeEvent({
				method: 'POST',
				path: '/api/applications',
				body: JSON.stringify({
					app_alias: 'transcript-store',
					// Intentional duplicate to exercise the de-dup transform.
					compliance: ['HIPAA', 'CJIS', 'HIPAA', 'GDPR'],
				}),
				jwtClaims: adminClaims(),
			}),
			deps,
		);

		expect(statusOf(result)).toBe(201);
		expect(deps.applications.create).toHaveBeenCalledWith(
			expect.objectContaining({
				app_alias: 'transcript-store',
				compliance: ['HIPAA', 'CJIS', 'GDPR'],
			}),
			'admin@example.com',
		);
	});

	it('normalizes a missing compliance field to an empty array', async () => {
		// Older clients (or any caller that just does not know about the new
		// field) must keep working: no `compliance` key in the body should
		// produce `[]` at the domain boundary, matching the DB default.
		const deps = makeDeps('cognito');
		const result = await routeHttp(
			makeEvent({
				method: 'POST',
				path: '/api/applications',
				body: JSON.stringify({ app_alias: 'minimal' }),
				jwtClaims: adminClaims(),
			}),
			deps,
		);

		expect(statusOf(result)).toBe(201);
		expect(deps.applications.create).toHaveBeenCalledWith(
			expect.objectContaining({
				app_alias: 'minimal',
				compliance: [],
			}),
			'admin@example.com',
		);
	});

	it('rejects an unknown compliance tag with 400 and does not call the service', async () => {
		const deps = makeDeps('cognito');
		const result = await routeHttp(
			makeEvent({
				method: 'POST',
				path: '/api/applications',
				body: JSON.stringify({
					app_alias: 'bad-tag',
					compliance: ['HIPAA', 'NOT_A_REAL_TAG'],
				}),
				jwtClaims: adminClaims(),
			}),
			deps,
		);

		expect(statusOf(result)).toBe(400);
		expect(deps.applications.create).not.toHaveBeenCalled();
	});

	it('forwards compliance on PATCH (replace semantics, not merge)', async () => {
		const deps = makeDeps('cognito');
		const result = await routeHttp(
			makeEvent({
				method: 'PATCH',
				path: '/api/applications/1',
				body: JSON.stringify({ compliance: ['SOC2'] }),
				jwtClaims: adminClaims(),
			}),
			deps,
		);

		expect(statusOf(result)).toBe(200);
		expect(deps.applications.update).toHaveBeenCalledWith(
			'1',
			expect.objectContaining({ compliance: ['SOC2'] }),
			'admin@example.com',
		);
	});

	it('PATCH without compliance does not include compliance in the patch', async () => {
		// The repo applies a SET only for keys present in the patch. Omitting
		// `compliance` from the body must leave the column untouched, so we
		// confirm the parsed patch does not carry a `compliance` key at all.
		const deps = makeDeps('cognito');
		const result = await routeHttp(
			makeEvent({
				method: 'PATCH',
				path: '/api/applications/1',
				body: JSON.stringify({ business_name: 'renamed' }),
				jwtClaims: adminClaims(),
			}),
			deps,
		);

		expect(statusOf(result)).toBe(200);
		const callArg = (deps.applications.update as ReturnType<typeof vi.fn>)
			.mock.calls[0][1] as Record<string, unknown>;
		expect(callArg).not.toHaveProperty('compliance');
	});
});
