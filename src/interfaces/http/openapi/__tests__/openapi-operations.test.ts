import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { AppConfig } from '../../../../config.js';
import type { LoggerPort } from '../../../../observability/logger.port.js';
import { routeHttp, type RouterDeps } from '../../api-router.js';
import type { NormalizedHttpEvent } from '../../normalize-event.js';
import {
	COMPONENT_SCHEMAS,
	type ComponentSchemaName,
} from '../openapi-components.js';
import {
	OPENAPI_OPERATIONS,
	type OpenApiOperation,
} from '../openapi-operations.js';

/**
 * Walks every documented operation through the real router with faked
 * services. This proves two things the spec cannot prove about itself:
 * each documented path and method is actually routed (no 404), and the
 * sample rows the services return satisfy the documented response schemas.
 */

const AUDIT = {
	is_active: true,
	created_at: '2026-01-01T00:00:00.000Z',
	updated_at: '2026-01-01T00:00:00.000Z',
	created_by: 'admin',
	updated_by: 'admin',
	deleted_by: null,
};

const APPLICATION_ROW = {
	id: '1',
	app_alias: 'billing',
	business_name: 'Billing',
	description: null,
	data_class: 'CONFIDENTIAL',
	compliance: ['PII', 'SOC2'],
	business_contact: null,
	development_contact: 'dev@example.com',
	support_contact: null,
	source_repository: 'https://git.example.com/billing',
	prod_url: null,
	runbook_url: null,
	...AUDIT,
};

const LANDSCAPE_ROW = {
	id: '2',
	name: 'delphi',
	description: null,
	organization: 'Platform',
	devops_contact: null,
	data_class: null,
	runbook_url: null,
	iac_repository: 'https://git.example.com/aws-delphi',
	...AUDIT,
};

const LANDSCAPE_ENVIRONMENT_ROW = {
	id: '3',
	landscape_id: '2',
	environment_name: 'dev',
	hosting_provider: 'AWS',
	provider_account_name: 'delphi-dev',
	provider_account_number: '000000000000',
	direct_link: null,
	...AUDIT,
};

const RESOURCE_ROW = {
	id: '4',
	landscape_id: '2',
	landscape_environment_id: '3',
	application_id: '1',
	resource_scope: 'APPLICATION',
	name: 'billing-db',
	description: null,
	region: 'us-east-1',
	service: 'RDS',
	resource_type: 'db-instance',
	provider_resource_id: 'arn:aws:rds:us-east-1:000000000000:db:billing',
	...AUDIT,
};

const HOSTING_PROVIDER_ROW = {
	id: '5',
	code: 'AWS',
	display_name: 'Amazon Web Services',
	description: null,
	...AUDIT,
};

const REQUEST_BODIES: Partial<Record<ComponentSchemaName, unknown>> = {
	CreateApplicationRequest: { app_alias: 'billing', compliance: ['PII'] },
	UpdateApplicationRequest: { business_name: 'Billing v2' },
	CreateLandscapeRequest: { name: 'delphi' },
	UpdateLandscapeRequest: { organization: 'Platform' },
	CreateLandscapeEnvironmentRequest: {
		landscape_id: '2',
		environment_name: 'dev',
		hosting_provider: 'aws',
	},
	UpdateLandscapeEnvironmentRequest: { direct_link: null },
	CreateResourceRequest: {
		landscape_id: '2',
		landscape_environment_id: '3',
		application_id: '1',
		resource_scope: 'APPLICATION',
		name: 'billing-db',
	},
	UpdateResourceRequest: { region: 'us-west-2' },
	CreateHostingProviderRequest: { code: 'aws', display_name: 'AWS' },
	UpdateHostingProviderRequest: { display_name: 'Amazon Web Services' },
};

function crudMock<Row>(row: Row): Record<string, unknown> {
	return {
		list: vi.fn(async () => [row]),
		getById: vi.fn(async () => row),
		create: vi.fn(async () => row),
		update: vi.fn(async () => row),
		softDelete: vi.fn(async () => undefined),
	};
}

function silentLogger(): LoggerPort {
	const noop = (): void => {};
	const logger: LoggerPort = {
		debug: noop,
		info: noop,
		warn: noop,
		error: noop,
		child: () => logger,
	};
	return logger;
}

function makeDeps(): RouterDeps {
	return {
		config: {
			AUTH_MODE: 'basic',
			BASIC_AUTH_ADMIN_USER: 'admin',
			BASIC_AUTH_ADMIN_PASSWORD: 'admin-pw',
		} as AppConfig,
		applications: crudMock(
			APPLICATION_ROW,
		) as unknown as RouterDeps['applications'],
		landscapes: crudMock(
			LANDSCAPE_ROW,
		) as unknown as RouterDeps['landscapes'],
		landscapeEnvironments: crudMock(
			LANDSCAPE_ENVIRONMENT_ROW,
		) as unknown as RouterDeps['landscapeEnvironments'],
		resources: crudMock(RESOURCE_ROW) as unknown as RouterDeps['resources'],
		hostingProviders: crudMock(
			HOSTING_PROVIDER_ROW,
		) as unknown as RouterDeps['hostingProviders'],
		logger: silentLogger(),
	};
}

function eventFor(op: OpenApiOperation): NormalizedHttpEvent {
	const body =
		op.requestBody === null
			? null
			: JSON.stringify(REQUEST_BODIES[op.requestBody]);
	return {
		method: op.method.toUpperCase(),
		path: `/api${op.path.replace('{id}', '1')}`,
		queryString: undefined,
		headers: {
			authorization: `Basic ${Buffer.from('admin:admin-pw').toString('base64')}`,
		},
		body,
		isBase64Encoded: false,
		requestOrigin: undefined,
		requestId: 'req-1',
		clientRequestId: undefined,
		correlationId: undefined,
		sourceIp: '127.0.0.1',
		jwtClaims: null,
	};
}

function operationLabel(op: OpenApiOperation): string {
	return `${op.method.toUpperCase()} ${op.path} (${op.operationId})`;
}

describe('OPENAPI_OPERATIONS against routeHttp', () => {
	it.each(OPENAPI_OPERATIONS.map((op) => [operationLabel(op), op] as const))(
		'given %s, when called as admin, then it returns the documented status and body',
		async (_label, op) => {
			// Arrange
			const deps = makeDeps();

			// Act
			const result = await routeHttp(eventFor(op), deps);

			// Assert
			const { statusCode, body } = result as {
				statusCode: number;
				body: string;
			};
			expect(statusCode).toBe(op.success.status);
			if (op.success.schema !== null) {
				const schema = COMPONENT_SCHEMAS[op.success.schema];
				const expected = op.success.array ? z.array(schema) : schema;
				expect(() => expected.parse(JSON.parse(body))).not.toThrow();
			}
		},
	);

	it('given each request component, when parsed with its schema, then the sample body is valid', () => {
		for (const [name, sample] of Object.entries(REQUEST_BODIES)) {
			// Arrange
			const target = COMPONENT_SCHEMAS[name as ComponentSchemaName];

			// Act
			const parsed = target.safeParse(sample);

			// Assert
			expect(parsed.success, name).toBe(true);
		}
	});
});
