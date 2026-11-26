import type { AuthRole } from '../basic-auth.js';
import type { ComponentSchemaName } from './openapi-components.js';

/**
 * The API surface, described as data. `openapi-document.ts` renders this into
 * an OpenAPI 3.1 document; a test walks the same list through `routeHttp` to
 * prove every documented operation is really routed. When you add a route to
 * `api-router.ts`, add it here too, or the router-coverage test will not know
 * about it (and the spec will silently lag).
 */

export type HttpMethod = 'get' | 'post' | 'patch' | 'delete';

export type ErrorStatus = 400 | 401 | 403 | 404 | 409 | 500;

export type QueryParam = {
	name: string;
	description: string;
	type: 'boolean' | 'id';
};

export type OpenApiOperation = {
	method: HttpMethod;
	/** OpenAPI path template, relative to the `/api` server URL. */
	path: string;
	operationId: string;
	tag: string;
	summary: string;
	description: string;
	/** Lowest role that may call this; null means no authentication. */
	requiredRole: AuthRole | null;
	query: readonly QueryParam[];
	requestBody: ComponentSchemaName | null;
	success: {
		status: 200 | 201 | 204;
		schema: ComponentSchemaName | null;
		array: boolean;
	};
	errors: readonly ErrorStatus[];
};

const INCLUDE_INACTIVE: QueryParam = {
	name: 'include_inactive',
	description:
		'Include soft-deleted rows. Accepts true or 1; anything else is false.',
	type: 'boolean',
};

const idFilter = (name: string, what: string): QueryParam => ({
	name,
	description: `Only return rows belonging to this ${what} id.`,
	type: 'id',
});

type CrudSpec = {
	tag: string;
	path: string;
	singular: string;
	plural: string;
	entity: ComponentSchemaName;
	createRequest: ComponentSchemaName;
	updateRequest: ComponentSchemaName;
	writeRole: AuthRole;
	listFilters: readonly QueryParam[];
	notes: {
		create: string;
		update: string;
		delete: string;
	};
};

const SOFT_DELETE_NOTE =
	'Deletes are soft: the row stays, with is_active=false and deleted_by set, and is hidden from lists unless include_inactive=true. Deleting an already inactive row is a no-op that still returns 204.';

function words(pascal: string): string {
	return pascal.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

function crudOperations(spec: CrudSpec): OpenApiOperation[] {
	const item = `${spec.path}/{id}`;
	const one = words(spec.singular);
	const many = words(spec.plural);
	const writeNote =
		spec.writeRole === 'admin'
			? 'Requires the admin role.'
			: `Requires the ${spec.writeRole} or admin role.`;

	return [
		{
			method: 'get',
			path: spec.path,
			operationId: `list${spec.plural}`,
			tag: spec.tag,
			summary: `List ${many}`,
			description: `Returns active ${many}, or all of them with include_inactive=true. Not paginated.`,
			requiredRole: 'viewer',
			query: [INCLUDE_INACTIVE, ...spec.listFilters],
			requestBody: null,
			success: { status: 200, schema: spec.entity, array: true },
			errors: [400, 401, 500],
		},
		{
			method: 'get',
			path: item,
			operationId: `get${spec.singular}`,
			tag: spec.tag,
			summary: `Get a ${one}`,
			description: `Returns one ${one} by id, including soft-deleted ones.`,
			requiredRole: 'viewer',
			query: [],
			requestBody: null,
			success: { status: 200, schema: spec.entity, array: false },
			errors: [400, 401, 404, 500],
		},
		{
			method: 'post',
			path: spec.path,
			operationId: `create${spec.singular}`,
			tag: spec.tag,
			summary: `Create a ${one}`,
			description: `${spec.notes.create} ${writeNote}`,
			requiredRole: spec.writeRole,
			query: [],
			requestBody: spec.createRequest,
			success: { status: 201, schema: spec.entity, array: false },
			errors: [400, 401, 403, 409, 500],
		},
		{
			method: 'patch',
			path: item,
			operationId: `update${spec.singular}`,
			tag: spec.tag,
			summary: `Update a ${one}`,
			description: `Partial update: send only the fields to change. ${spec.notes.update} ${writeNote}`,
			requiredRole: spec.writeRole,
			query: [],
			requestBody: spec.updateRequest,
			success: { status: 200, schema: spec.entity, array: false },
			errors: [400, 401, 403, 404, 409, 500],
		},
		{
			method: 'delete',
			path: item,
			operationId: `delete${spec.singular}`,
			tag: spec.tag,
			summary: `Delete a ${one}`,
			description: [SOFT_DELETE_NOTE, spec.notes.delete, writeNote]
				.filter((part) => part !== '')
				.join(' '),
			requiredRole: spec.writeRole,
			query: [],
			requestBody: null,
			success: { status: 204, schema: null, array: false },
			errors: [400, 401, 403, 404, 409, 500],
		},
	];
}

export const OPENAPI_OPERATIONS: readonly OpenApiOperation[] = [
	{
		method: 'get',
		path: '/health',
		operationId: 'getHealth',
		tag: 'System',
		summary: 'Liveness check',
		description: 'Returns ok without authentication.',
		requiredRole: null,
		query: [],
		requestBody: null,
		success: { status: 200, schema: 'Health', array: false },
		errors: [],
	},
	{
		method: 'get',
		path: '/me',
		operationId: 'getMe',
		tag: 'System',
		summary: 'Who am I',
		description:
			'Returns the authenticated principal and its effective role. Call this first to learn what you are allowed to change.',
		requiredRole: 'viewer',
		query: [],
		requestBody: null,
		success: { status: 200, schema: 'Me', array: false },
		errors: [401],
	},
	{
		method: 'get',
		path: '/openapi.json',
		operationId: 'getOpenApiDocument',
		tag: 'System',
		summary: 'This OpenAPI document',
		description:
			'Returns this document. Only the auth schemes the deployment accepts are listed.',
		requiredRole: 'viewer',
		query: [],
		requestBody: null,
		success: { status: 200, schema: null, array: false },
		errors: [401],
	},
	...crudOperations({
		tag: 'Applications',
		path: '/applications',
		singular: 'Application',
		plural: 'Applications',
		entity: 'Application',
		createRequest: 'CreateApplicationRequest',
		updateRequest: 'UpdateApplicationRequest',
		writeRole: 'app_editor',
		listFilters: [],
		notes: {
			create: 'app_alias is required and must be unique (409 if taken). Duplicate compliance tags are dropped.',
			update: 'Changing app_alias to one already in use returns 409.',
			delete: 'Resources that reference the application are not deactivated with it.',
		},
	}),
	...crudOperations({
		tag: 'Landscapes',
		path: '/landscapes',
		singular: 'Landscape',
		plural: 'Landscapes',
		entity: 'Landscape',
		createRequest: 'CreateLandscapeRequest',
		updateRequest: 'UpdateLandscapeRequest',
		writeRole: 'admin',
		listFilters: [],
		notes: {
			create: 'name is required and must be unique (409 if taken).',
			update: 'Renaming to a name already in use returns 409.',
			delete: 'Environments and resources in the landscape are not deactivated with it.',
		},
	}),
	...crudOperations({
		tag: 'Landscape environments',
		path: '/landscape-environments',
		singular: 'LandscapeEnvironment',
		plural: 'LandscapeEnvironments',
		entity: 'LandscapeEnvironment',
		createRequest: 'CreateLandscapeEnvironmentRequest',
		updateRequest: 'UpdateLandscapeEnvironmentRequest',
		writeRole: 'admin',
		listFilters: [idFilter('landscape_id', 'landscape')],
		notes: {
			create: 'hosting_provider must be the code of an active hosting provider (it is upper-cased first). environment_name must be unique within the landscape, and hosting_provider plus provider_account_number must be unique (409).',
			update: 'The same uniqueness and hosting_provider rules as create apply.',
			delete: 'Resources in the environment are not deactivated with it.',
		},
	}),
	...crudOperations({
		tag: 'Resources',
		path: '/resources',
		singular: 'Resource',
		plural: 'Resources',
		entity: 'Resource',
		createRequest: 'CreateResourceRequest',
		updateRequest: 'UpdateResourceRequest',
		writeRole: 'admin',
		listFilters: [
			idFilter('landscape_id', 'landscape'),
			idFilter('landscape_environment_id', 'landscape environment'),
			idFilter('application_id', 'application'),
		],
		notes: {
			create: 'landscape_environment_id must belong to landscape_id. When resource_scope is APPLICATION, application_id is required; when ENVIRONMENT, it must be null (400 otherwise). provider_resource_id must be unique within the environment (409).',
			update: 'The scope, landscape, and uniqueness rules from create are re-checked against the merged record.',
			delete: '',
		},
	}),
	...crudOperations({
		tag: 'Hosting providers',
		path: '/hosting-providers',
		singular: 'HostingProvider',
		plural: 'HostingProviders',
		entity: 'HostingProvider',
		createRequest: 'CreateHostingProviderRequest',
		updateRequest: 'UpdateHostingProviderRequest',
		writeRole: 'admin',
		listFilters: [],
		notes: {
			create: 'code is upper-cased, must be SCREAMING_SNAKE, must be unique (409), and cannot be changed later.',
			update: 'code is immutable, so it is not accepted here.',
			delete: 'Fails with 409 while active landscape environments still use the code.',
		},
	}),
];
