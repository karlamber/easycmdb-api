import { z } from 'zod';
import type { AppConfig } from '../../../config.js';
import { COMPONENT_SCHEMAS } from './openapi-components.js';
import {
	OPENAPI_OPERATIONS,
	type ErrorStatus,
	type OpenApiOperation,
	type QueryParam,
} from './openapi-operations.js';

type AuthMode = AppConfig['AUTH_MODE'];

type JsonObject = { [key: string]: unknown };

export type OpenApiDocument = JsonObject & {
	openapi: '3.1.0';
	paths: Record<string, Record<string, JsonObject>>;
	components: JsonObject & { schemas: Record<string, JsonObject> };
};

/** Keep in step with package.json "version". */
const API_VERSION = '0.1.0';

const SCHEMA_REF_PREFIX = '#/components/schemas/';

const ID_SCHEMA = { type: 'string', pattern: '^\\d+$' } as const;

const ERROR_RESPONSES: Record<
	ErrorStatus,
	{ name: string; description: string }
> = {
	400: {
		name: 'BadRequest',
		description:
			'The body, path, or query failed validation (details holds per-field messages), or a business rule was broken (code VALIDATION_ERROR).',
	},
	401: {
		name: 'Unauthorized',
		description: 'Missing or invalid credentials.',
	},
	403: {
		name: 'Forbidden',
		description:
			'Authenticated, but the role may not make this change (code INSUFFICIENT_ROLE).',
	},
	404: {
		name: 'NotFound',
		description: 'No record with that id (code NOT_FOUND).',
	},
	409: {
		name: 'Conflict',
		description:
			'A uniqueness rule or a dependent record blocks the change (code CONFLICT).',
	},
	500: {
		name: 'InternalError',
		description:
			'Unexpected server error. Quote requestId when reporting it.',
	},
};

const SUCCESS_DESCRIPTIONS = {
	200: 'OK',
	201: 'Created',
	204: 'Deleted (no body)',
} as const;

const TAGS = [
	{ name: 'System', description: 'Health, identity, and this document.' },
	{
		name: 'Applications',
		description: 'Software applications. Writable by app_editor and admin.',
	},
	{
		name: 'Landscapes',
		description: 'Hosting landscapes, each a group of environments.',
	},
	{
		name: 'Landscape environments',
		description:
			'Environments (dev, tst, prod, ...) inside a landscape, each at one hosting provider account.',
	},
	{
		name: 'Resources',
		description:
			'Infrastructure resources in an environment, optionally owned by an application.',
	},
	{
		name: 'Hosting providers',
		description:
			'Lookup list of providers (AWS, AZURE, ...) that environments reference by code.',
	},
] as const;

const DESCRIPTION = [
	'easyCMDB is a configuration inventory: landscapes contain environments, environments contain resources, and resources can belong to applications.',
	'',
	'Conventions:',
	'- Ids are numeric strings, e.g. "42".',
	'- Lists are not paginated. Inactive (soft-deleted) rows are hidden unless include_inactive=true.',
	'- Deletes are soft. Audit fields (created_by, updated_by, deleted_by) come from the caller identity and cannot be set by clients.',
	'- Roles: viewer can read everything; app_editor can also write applications; admin can write everything. Each operation lists its lowest allowed role in x-required-role. Call GET /me to see your role.',
	'- Errors share one body shape, the Error schema.',
].join('\n');

function schemaRef(name: string): JsonObject {
	return { $ref: `${SCHEMA_REF_PREFIX}${name}` };
}

function buildComponentSchemas(): Record<string, JsonObject> {
	const registry = z.registry<{ id: string }>();
	for (const [id, schema] of Object.entries(COMPONENT_SCHEMAS)) {
		registry.add(schema, { id });
	}
	const { schemas } = z.toJSONSchema(registry, {
		io: 'input',
		uri: (id) => `${SCHEMA_REF_PREFIX}${id}`,
	});
	// Each component comes back as a standalone JSON Schema document. Inside
	// an OpenAPI 3.1 document the dialect is implied, so drop $schema and $id.
	return Object.fromEntries(
		Object.entries(schemas).map(([id, schema]) => [
			id,
			Object.fromEntries(
				Object.entries(schema).filter(
					([key]) => key !== '$schema' && key !== '$id',
				),
			),
		]),
	);
}

function securitySchemes(mode: AuthMode): JsonObject {
	const basic = {
		basicAuth: {
			type: 'http',
			scheme: 'basic',
			description:
				'HTTP Basic with a configured viewer or admin account.',
		},
	};
	const bearer = {
		bearerAuth: {
			type: 'http',
			scheme: 'bearer',
			bearerFormat: 'JWT',
			description:
				'Cognito access or ID token. The role comes from the custom:roles or cognito:groups claim.',
		},
	};
	if (mode === 'basic') return basic;
	if (mode === 'cognito') return bearer;
	return { ...basic, ...bearer };
}

function queryParameter(param: QueryParam): JsonObject {
	return {
		name: param.name,
		in: 'query',
		required: false,
		description: param.description,
		schema: param.type === 'boolean' ? { type: 'boolean' } : ID_SCHEMA,
	};
}

function successResponse(op: OpenApiOperation): JsonObject {
	const description = SUCCESS_DESCRIPTIONS[op.success.status];
	if (op.success.status === 204) {
		return { description };
	}
	const schema =
		op.success.schema === null
			? { type: 'object', description: 'An OpenAPI 3.1 document.' }
			: op.success.array
				? { type: 'array', items: schemaRef(op.success.schema) }
				: schemaRef(op.success.schema);
	return { description, content: { 'application/json': { schema } } };
}

function operationObject(op: OpenApiOperation): JsonObject {
	const pathParameters = op.path.includes('{id}')
		? [
				{
					name: 'id',
					in: 'path',
					required: true,
					description: 'Record id.',
					schema: ID_SCHEMA,
				},
			]
		: [];
	const parameters = [...pathParameters, ...op.query.map(queryParameter)];
	const errorResponses = Object.fromEntries(
		op.errors.map((status) => [
			String(status),
			{ $ref: `#/components/responses/${ERROR_RESPONSES[status].name}` },
		]),
	);

	return {
		operationId: op.operationId,
		tags: [op.tag],
		summary: op.summary,
		description: op.description,
		...(op.requiredRole === null
			? { security: [] }
			: { 'x-required-role': op.requiredRole }),
		...(parameters.length > 0 ? { parameters } : {}),
		...(op.requestBody === null
			? {}
			: {
					requestBody: {
						required: true,
						content: {
							'application/json': {
								schema: schemaRef(op.requestBody),
							},
						},
					},
				}),
		responses: {
			[String(op.success.status)]: successResponse(op),
			...errorResponses,
		},
	};
}

function buildPaths(): OpenApiDocument['paths'] {
	const paths: OpenApiDocument['paths'] = {};
	for (const op of OPENAPI_OPERATIONS) {
		paths[op.path] = {
			...paths[op.path],
			[op.method]: operationObject(op),
		};
	}
	return paths;
}

function buildComponentResponses(): JsonObject {
	return Object.fromEntries(
		Object.values(ERROR_RESPONSES).map(({ name, description }) => [
			name,
			{
				description,
				content: {
					'application/json': { schema: schemaRef('Error') },
				},
			},
		]),
	);
}

/**
 * Build the OpenAPI 3.1 document for the API. Only the auth schemes that
 * `mode` accepts are advertised, so a Cognito-only deployment does not invite
 * agents to try Basic auth.
 */
export function buildOpenApiDocument(mode: AuthMode): OpenApiDocument {
	const schemes = securitySchemes(mode);
	return {
		openapi: '3.1.0',
		info: {
			title: 'easyCMDB API',
			version: API_VERSION,
			description: DESCRIPTION,
		},
		servers: [
			{
				url: '/api',
				description:
					'Relative to the host that serves the easyCMDB web app.',
			},
		],
		tags: TAGS.map((tag) => ({ ...tag })),
		security: Object.keys(schemes).map((name) => ({ [name]: [] })),
		paths: buildPaths(),
		components: {
			securitySchemes: schemes,
			schemas: buildComponentSchemas(),
			responses: buildComponentResponses(),
		},
	};
}

const documentCache = new Map<AuthMode, OpenApiDocument>();

/** Memoized per auth mode; the document never changes within a process. */
export function getOpenApiDocument(mode: AuthMode): OpenApiDocument {
	const cached = documentCache.get(mode);
	if (cached) return cached;
	const built = buildOpenApiDocument(mode);
	documentCache.set(mode, built);
	return built;
}
