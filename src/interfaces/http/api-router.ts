import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { ZodError } from 'zod';
import type { AppConfig } from '../../config.js';
import type { ApplicationCrudService } from '../../application/application-crud.service.js';
import type { HostingProviderCrudService } from '../../application/hosting-provider-crud.service.js';
import type { LandscapeCrudService } from '../../application/landscape-crud.service.js';
import type { LandscapeEnvironmentCrudService } from '../../application/landscape-environment-crud.service.js';
import type { ResourceCrudService } from '../../application/resource-crud.service.js';
import { DomainError, ValidationError } from '../../domain/errors.js';
import { logAuditMutation } from '../../observability/audit-mutation.js';
import type { LoggerPort } from '../../observability/logger.port.js';
import {
	authenticateBasicAuth,
	type AuthAccount,
	type AuthIdentity,
	type AuthRole,
} from './basic-auth.js';
import { responseRequestId } from './correlation.js';
import { corsHeaders } from './cors.js';
import { identityFromJwtClaims } from './jwt-auth.js';
import type { NormalizedHttpEvent } from './normalize-event.js';
import { decodeBody, stripApiPrefix } from './normalize-event.js';
import {
	applicationIdParamSchema,
	createApplicationSchema,
	createHostingProviderSchema,
	createLandscapeEnvironmentSchema,
	createLandscapeSchema,
	createResourceSchema,
	toCreateApplicationInput,
	toCreateHostingProviderInput,
	toCreateLandscapeEnvironmentInput,
	toCreateLandscapeInput,
	toCreateResourceInput,
	parseIncludeInactive,
	parseOptionalId,
	updateApplicationSchema,
	updateHostingProviderSchema,
	updateLandscapeEnvironmentSchema,
	updateLandscapeSchema,
	updateResourceSchema,
} from './schemas.js';

export type RouterDeps = {
	config: AppConfig;
	applications: ApplicationCrudService;
	landscapes: LandscapeCrudService;
	landscapeEnvironments: LandscapeEnvironmentCrudService;
	resources: ResourceCrudService;
	hostingProviders: HostingProviderCrudService;
	/** Request-scoped logger with correlation bindings attached. */
	logger: LoggerPort;
};

function json(
	statusCode: number,
	body: unknown,
	cors: Record<string, string>,
): APIGatewayProxyResultV2 {
	return {
		statusCode,
		headers: {
			'content-type': 'application/json; charset=utf-8',
			...cors,
		},
		body: JSON.stringify(body),
	};
}

function noContent(cors: Record<string, string>): APIGatewayProxyResultV2 {
	return {
		statusCode: 204,
		headers: { ...cors },
		body: '',
	};
}

function internalServerError(
	cors: Record<string, string>,
	requestId: string,
): APIGatewayProxyResultV2 {
	return json(500, { error: 'Internal server error', requestId }, cors);
}

function changedFields(patch: object): string[] {
	return Object.keys(patch);
}

function parseJsonBody(text: string): unknown {
	try {
		return JSON.parse(text || '{}');
	} catch {
		throw new ValidationError('Invalid JSON body');
	}
}

function matchPath(path: string, pattern: RegExp): RegExpMatchArray | null {
	return path.match(pattern);
}

function buildAccounts(config: AppConfig): AuthAccount[] {
	const accounts: AuthAccount[] = [];
	if (config.BASIC_AUTH_USER && config.BASIC_AUTH_PASSWORD) {
		accounts.push({
			user: config.BASIC_AUTH_USER,
			password: config.BASIC_AUTH_PASSWORD,
			role: 'viewer',
		});
	}
	if (config.BASIC_AUTH_ADMIN_USER && config.BASIC_AUTH_ADMIN_PASSWORD) {
		accounts.push({
			user: config.BASIC_AUTH_ADMIN_USER,
			password: config.BASIC_AUTH_ADMIN_PASSWORD,
			role: 'admin',
		});
	}
	return accounts;
}

/**
 * Resolve the authenticated identity (or null) for an incoming request based
 * on AUTH_MODE. Returns an `authMethod` so the response layer can decide
 * whether to advertise `WWW-Authenticate: Basic` (we only advertise it when
 * basic auth is actually in play - JWT clients shouldn't be prompted for
 * Basic credentials).
 */
type AuthResolution = {
	identity: AuthIdentity | null;
	authMethod: 'basic' | 'jwt' | 'none';
};

function resolveIdentity(
	rawEvent: NormalizedHttpEvent,
	config: AppConfig,
): AuthResolution {
	const mode = config.AUTH_MODE;
	const allowJwt = mode === 'cognito' || mode === 'both';
	const allowBasic = mode === 'basic' || mode === 'both';

	if (allowJwt && rawEvent.jwtClaims) {
		const identity = identityFromJwtClaims(rawEvent.jwtClaims, {
			adminClaimValue: config.ADMIN_ROLE_CLAIM_VALUE,
			appEditorClaimValue: config.APP_EDIT_ROLE_CLAIM_VALUE,
			viewerClaimValue: config.VIEWER_ROLE_CLAIM_VALUE,
		});
		if (identity) {
			return { identity, authMethod: 'jwt' };
		}
		// `cognito` mode is strict: a route guarded by the JWT authorizer
		// produced claims we can't map to an identity (e.g. token has no
		// email or sub). Fail closed rather than silently downgrading.
		if (mode === 'cognito') {
			return { identity: null, authMethod: 'jwt' };
		}
	}

	if (allowBasic) {
		const identity = authenticateBasicAuth(
			rawEvent.headers['authorization'],
			buildAccounts(config),
		);
		return { identity, authMethod: 'basic' };
	}

	return { identity: null, authMethod: 'none' };
}

function isWriteMethod(method: string): boolean {
	return method === 'POST' || method === 'PATCH' || method === 'DELETE';
}

const APPLICATIONS_PATH_RE = /^\/applications(\/\d+)?$/;

/**
 * Authorise a write attempt against the resource encoded in `path`.
 *
 * - admin       can write to every resource.
 * - app_editor  can write ONLY to /applications and /applications/{id}.
 *               Any other write is rejected here so the role cannot be used
 *               to mutate Landscapes, Environments, or Resources.
 * - viewer      cannot write to anything.
 *
 * The guard intentionally lives next to the routing table (rather than per
 * branch below) so adding a new resource forces the author to revisit
 * authorisation in a single place.
 */
function roleCanWritePath(role: AuthRole, path: string): boolean {
	if (role === 'admin') return true;
	if (role === 'app_editor') return APPLICATIONS_PATH_RE.test(path);
	return false;
}

export async function routeHttp(
	rawEvent: NormalizedHttpEvent,
	deps: RouterDeps,
): Promise<APIGatewayProxyResultV2> {
	const cors = corsHeaders(deps.config, rawEvent.requestOrigin);
	const method = rawEvent.method.toUpperCase();
	const path = stripApiPrefix(rawEvent.path);

	if (method === 'OPTIONS') {
		return { statusCode: 204, headers: { ...cors }, body: '' };
	}

	if (method === 'GET' && path === '/health') {
		return json(200, { ok: true }, cors);
	}

	const { identity, authMethod } = resolveIdentity(rawEvent, deps.config);
	if (!identity) {
		deps.logger.warn('request.auth_failed', {
			method,
			path,
			authMode: deps.config.AUTH_MODE,
			authMethod,
			hasAuthHeader: Boolean(rawEvent.headers['authorization']),
			hasJwtClaims: Boolean(rawEvent.jwtClaims),
		});
		// Browsers pop a native HTTP Basic login dialog whenever they see a
		// 401 carrying `WWW-Authenticate: Basic`. That is the right behavior
		// only when the caller was actually using Basic auth (i.e. their
		// Authorization header started with `Basic`). For Bearer tokens, a
		// missing header, or anything else, we must NOT advertise Basic - the
		// SPA collects credentials via its own form and never wants the
		// browser dialog, and Cognito-authenticated callers would otherwise
		// get a confusing username/password prompt mid-session.
		const headers: Record<string, string> = { ...cors };
		const incomingAuth = rawEvent.headers['authorization'] ?? '';
		const incomingIsBasic = /^basic\s/i.test(incomingAuth);
		if (authMethod === 'basic' && incomingIsBasic) {
			headers['www-authenticate'] =
				'Basic realm="easycmdb", charset="UTF-8"';
		}
		return {
			statusCode: 401,
			headers,
			body: JSON.stringify({ error: 'Unauthorized' }),
		};
	}

	if (method === 'GET' && path === '/me') {
		return json(200, { user: identity.user, role: identity.role }, cors);
	}

	const logger = deps.logger.child({
		user: identity.user,
		role: identity.role,
		authMethod,
	});
	logger.info('request.authenticated');

	if (isWriteMethod(method) && !roleCanWritePath(identity.role, path)) {
		logger.warn('request.forbidden', {
			method,
			path,
			reason: 'INSUFFICIENT_ROLE',
		});
		return json(
			403,
			{ error: 'Forbidden', code: 'INSUFFICIENT_ROLE' },
			cors,
		);
	}

	const echoRequestId = responseRequestId(rawEvent);

	const bodyText = decodeBody(rawEvent);
	const includeInactive = parseIncludeInactive(rawEvent.queryString);

	try {
		if (method === 'GET' && path === '/applications') {
			const rows = await deps.applications.list(includeInactive);
			return json(200, rows, cors);
		}
		if (method === 'GET') {
			const m = matchPath(path, /^\/applications\/(\d+)$/);
			if (m) {
				const { id } = applicationIdParamSchema.parse({ id: m[1] });
				const row = await deps.applications.getById(id);
				return json(200, row, cors);
			}
		}
		if (method === 'POST' && path === '/applications') {
			const parsed = createApplicationSchema.parse(
				parseJsonBody(bodyText),
			);
			const row = await deps.applications.create(
				toCreateApplicationInput(parsed),
				identity.user,
			);
			logAuditMutation(logger, {
				action: 'create',
				entity: 'application',
				entityId: row.id,
			});
			return json(201, row, cors);
		}
		if (method === 'PATCH') {
			const m = matchPath(path, /^\/applications\/(\d+)$/);
			if (m) {
				const { id } = applicationIdParamSchema.parse({ id: m[1] });
				const parsed = updateApplicationSchema.parse(
					parseJsonBody(bodyText),
				);
				const row = await deps.applications.update(
					id,
					parsed,
					identity.user,
				);
				logAuditMutation(logger, {
					action: 'update',
					entity: 'application',
					entityId: id,
					changedFields: changedFields(parsed),
				});
				return json(200, row, cors);
			}
		}
		if (method === 'DELETE') {
			const m = matchPath(path, /^\/applications\/(\d+)$/);
			if (m) {
				const { id } = applicationIdParamSchema.parse({ id: m[1] });
				await deps.applications.softDelete(id, identity.user);
				logAuditMutation(logger, {
					action: 'delete',
					entity: 'application',
					entityId: id,
				});
				return noContent(cors);
			}
		}

		if (method === 'GET' && path === '/landscapes') {
			const rows = await deps.landscapes.list(includeInactive);
			return json(200, rows, cors);
		}
		if (method === 'GET') {
			const m = matchPath(path, /^\/landscapes\/(\d+)$/);
			if (m) {
				const { id } = applicationIdParamSchema.parse({ id: m[1] });
				const row = await deps.landscapes.getById(id);
				return json(200, row, cors);
			}
		}
		if (method === 'POST' && path === '/landscapes') {
			const parsed = createLandscapeSchema.parse(parseJsonBody(bodyText));
			const row = await deps.landscapes.create(
				toCreateLandscapeInput(parsed),
				identity.user,
			);
			logAuditMutation(logger, {
				action: 'create',
				entity: 'landscape',
				entityId: row.id,
			});
			return json(201, row, cors);
		}
		if (method === 'PATCH') {
			const m = matchPath(path, /^\/landscapes\/(\d+)$/);
			if (m) {
				const { id } = applicationIdParamSchema.parse({ id: m[1] });
				const parsed = updateLandscapeSchema.parse(
					parseJsonBody(bodyText),
				);
				const row = await deps.landscapes.update(
					id,
					parsed,
					identity.user,
				);
				logAuditMutation(logger, {
					action: 'update',
					entity: 'landscape',
					entityId: id,
					changedFields: changedFields(parsed),
				});
				return json(200, row, cors);
			}
		}
		if (method === 'DELETE') {
			const m = matchPath(path, /^\/landscapes\/(\d+)$/);
			if (m) {
				const { id } = applicationIdParamSchema.parse({ id: m[1] });
				await deps.landscapes.softDelete(id, identity.user);
				logAuditMutation(logger, {
					action: 'delete',
					entity: 'landscape',
					entityId: id,
				});
				return noContent(cors);
			}
		}

		if (method === 'GET' && path === '/landscape-environments') {
			const landscapeId = parseOptionalId(
				rawEvent.queryString,
				'landscape_id',
			);
			const rows = await deps.landscapeEnvironments.list(
				includeInactive,
				landscapeId,
			);
			return json(200, rows, cors);
		}
		if (method === 'GET') {
			const m = matchPath(path, /^\/landscape-environments\/(\d+)$/);
			if (m) {
				const { id } = applicationIdParamSchema.parse({ id: m[1] });
				const row = await deps.landscapeEnvironments.getById(id);
				return json(200, row, cors);
			}
		}
		if (method === 'POST' && path === '/landscape-environments') {
			const parsed = createLandscapeEnvironmentSchema.parse(
				parseJsonBody(bodyText),
			);
			const row = await deps.landscapeEnvironments.create(
				toCreateLandscapeEnvironmentInput(parsed),
				identity.user,
			);
			logAuditMutation(logger, {
				action: 'create',
				entity: 'landscape_environment',
				entityId: row.id,
			});
			return json(201, row, cors);
		}
		if (method === 'PATCH') {
			const m = matchPath(path, /^\/landscape-environments\/(\d+)$/);
			if (m) {
				const { id } = applicationIdParamSchema.parse({ id: m[1] });
				const parsed = updateLandscapeEnvironmentSchema.parse(
					parseJsonBody(bodyText),
				);
				const row = await deps.landscapeEnvironments.update(
					id,
					parsed,
					identity.user,
				);
				logAuditMutation(logger, {
					action: 'update',
					entity: 'landscape_environment',
					entityId: id,
					changedFields: changedFields(parsed),
				});
				return json(200, row, cors);
			}
		}
		if (method === 'DELETE') {
			const m = matchPath(path, /^\/landscape-environments\/(\d+)$/);
			if (m) {
				const { id } = applicationIdParamSchema.parse({ id: m[1] });
				await deps.landscapeEnvironments.softDelete(id, identity.user);
				logAuditMutation(logger, {
					action: 'delete',
					entity: 'landscape_environment',
					entityId: id,
				});
				return noContent(cors);
			}
		}

		if (method === 'GET' && path === '/resources') {
			const landscapeId = parseOptionalId(
				rawEvent.queryString,
				'landscape_id',
			);
			const landscapeEnvironmentId = parseOptionalId(
				rawEvent.queryString,
				'landscape_environment_id',
			);
			const applicationId = parseOptionalId(
				rawEvent.queryString,
				'application_id',
			);
			const rows = await deps.resources.list(includeInactive, {
				landscapeId,
				landscapeEnvironmentId,
				applicationId,
			});
			return json(200, rows, cors);
		}
		if (method === 'GET') {
			const m = matchPath(path, /^\/resources\/(\d+)$/);
			if (m) {
				const { id } = applicationIdParamSchema.parse({ id: m[1] });
				const row = await deps.resources.getById(id);
				return json(200, row, cors);
			}
		}
		if (method === 'POST' && path === '/resources') {
			const parsed = createResourceSchema.parse(parseJsonBody(bodyText));
			const row = await deps.resources.create(
				toCreateResourceInput(parsed),
				identity.user,
			);
			logAuditMutation(logger, {
				action: 'create',
				entity: 'resource',
				entityId: row.id,
			});
			return json(201, row, cors);
		}
		if (method === 'PATCH') {
			const m = matchPath(path, /^\/resources\/(\d+)$/);
			if (m) {
				const { id } = applicationIdParamSchema.parse({ id: m[1] });
				const parsed = updateResourceSchema.parse(
					parseJsonBody(bodyText),
				);
				const row = await deps.resources.update(
					id,
					parsed,
					identity.user,
				);
				logAuditMutation(logger, {
					action: 'update',
					entity: 'resource',
					entityId: id,
					changedFields: changedFields(parsed),
				});
				return json(200, row, cors);
			}
		}
		if (method === 'DELETE') {
			const m = matchPath(path, /^\/resources\/(\d+)$/);
			if (m) {
				const { id } = applicationIdParamSchema.parse({ id: m[1] });
				await deps.resources.softDelete(id, identity.user);
				logAuditMutation(logger, {
					action: 'delete',
					entity: 'resource',
					entityId: id,
				});
				return noContent(cors);
			}
		}

		if (method === 'GET' && path === '/hosting-providers') {
			const rows = await deps.hostingProviders.list(includeInactive);
			return json(200, rows, cors);
		}
		if (method === 'GET') {
			const m = matchPath(path, /^\/hosting-providers\/(\d+)$/);
			if (m) {
				const { id } = applicationIdParamSchema.parse({ id: m[1] });
				const row = await deps.hostingProviders.getById(id);
				return json(200, row, cors);
			}
		}
		if (method === 'POST' && path === '/hosting-providers') {
			const parsed = createHostingProviderSchema.parse(
				parseJsonBody(bodyText),
			);
			const row = await deps.hostingProviders.create(
				toCreateHostingProviderInput(parsed),
				identity.user,
			);
			logAuditMutation(logger, {
				action: 'create',
				entity: 'hosting_provider',
				entityId: row.id,
			});
			return json(201, row, cors);
		}
		if (method === 'PATCH') {
			const m = matchPath(path, /^\/hosting-providers\/(\d+)$/);
			if (m) {
				const { id } = applicationIdParamSchema.parse({ id: m[1] });
				const parsed = updateHostingProviderSchema.parse(
					parseJsonBody(bodyText),
				);
				const row = await deps.hostingProviders.update(
					id,
					parsed,
					identity.user,
				);
				logAuditMutation(logger, {
					action: 'update',
					entity: 'hosting_provider',
					entityId: id,
					changedFields: changedFields(parsed),
				});
				return json(200, row, cors);
			}
		}
		if (method === 'DELETE') {
			const m = matchPath(path, /^\/hosting-providers\/(\d+)$/);
			if (m) {
				const { id } = applicationIdParamSchema.parse({ id: m[1] });
				await deps.hostingProviders.softDelete(id, identity.user);
				logAuditMutation(logger, {
					action: 'delete',
					entity: 'hosting_provider',
					entityId: id,
				});
				return noContent(cors);
			}
		}

		logger.warn('request.not_found', { method, path });
		return json(404, { error: 'Not found' }, cors);
	} catch (err) {
		if (err instanceof ZodError) {
			logger.warn('request.validation_failed', {
				method,
				path,
				details: err.flatten(),
			});
			return json(
				400,
				{ error: 'Invalid request', details: err.flatten() },
				cors,
			);
		}
		if (err instanceof DomainError) {
			logger.warn('request.domain_error', {
				method,
				path,
				code: err.code,
				statusCode: err.statusCode,
				domainMessage: err.message,
			});
			return json(
				err.statusCode,
				{ error: err.message, code: err.code },
				cors,
			);
		}
		const wrapped =
			err instanceof Error ? err : new Error('Internal error');
		logger.error('request.unhandled_error', wrapped, {
			method,
			path,
		});
		return internalServerError(cors, echoRequestId);
	}
}
