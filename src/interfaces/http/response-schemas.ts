import { z } from 'zod';
import type { Application } from '../../domain/application.js';
import { COMPLIANCE_TAGS } from '../../domain/compliance.js';
import { DATA_CLASSES } from '../../domain/data-class.js';
import type { HostingProvider } from '../../domain/hosting-provider.js';
import type { LandscapeEnvironment } from '../../domain/landscape-environment.js';
import type { Landscape } from '../../domain/landscape.js';
import type { Resource } from '../../domain/resource.js';
import { AUTH_ROLES } from './basic-auth.js';

/**
 * Zod schemas for what the API sends back. The router does not validate its
 * own output at runtime; these exist to describe responses in the OpenAPI
 * document (and, later, to MCP tools). Each entity schema is annotated with
 * `z.ZodType<Entity>` so the compiler fails if a domain field is added or
 * retyped without updating the schema here.
 */

const idSchema = z
	.string()
	.regex(/^\d+$/)
	.describe('Numeric database id, serialized as a string.');

export const dataClassSchema = z
	.enum(DATA_CLASSES)
	.describe('Data sensitivity classification, from least to most sensitive.');

export const complianceTagSchema = z
	.enum(COMPLIANCE_TAGS)
	.describe('Compliance or regulatory framework tag.');

const nullableText = (description: string): z.ZodNullable<z.ZodString> =>
	z.string().nullable().describe(description);

const auditShape = {
	is_active: z
		.boolean()
		.describe(
			'False once the record is soft-deleted. Inactive rows are hidden from lists unless include_inactive=true.',
		),
	created_at: z.string().describe('ISO 8601 timestamp.'),
	updated_at: z.string().describe('ISO 8601 timestamp.'),
	created_by: nullableText('Principal that created the record.'),
	updated_by: nullableText('Principal that last updated the record.'),
	deleted_by: nullableText(
		'Principal that soft-deleted the record, or null while active.',
	),
};

export const applicationResponseSchema: z.ZodType<Application> = z
	.object({
		id: idSchema,
		app_alias: z
			.string()
			.describe('Short technical alias, unique across applications.'),
		business_name: nullableText('Human-friendly application name.'),
		description: nullableText('Free-text description.'),
		data_class: dataClassSchema.nullable(),
		compliance: z
			.array(complianceTagSchema)
			.describe('Distinct compliance tags. Always an array.'),
		business_contact: nullableText('Business owner contact.'),
		development_contact: nullableText('Development team contact.'),
		support_contact: nullableText('Support team contact.'),
		source_repository: nullableText('Source code repository URL.'),
		prod_url: nullableText('Production URL.'),
		runbook_url: nullableText('Runbook URL.'),
		...auditShape,
	})
	.describe('A software application tracked by the CMDB.');

export const landscapeResponseSchema: z.ZodType<Landscape> = z
	.object({
		id: idSchema,
		name: z.string().describe('Landscape name, unique.'),
		description: nullableText('Free-text description.'),
		organization: nullableText('Owning organization.'),
		devops_contact: nullableText('DevOps contact.'),
		data_class: dataClassSchema.nullable(),
		runbook_url: nullableText('Runbook URL.'),
		iac_repository: nullableText('Infrastructure-as-code repository URL.'),
		...auditShape,
	})
	.describe(
		'A hosting landscape (a group of environments, e.g. one per platform team).',
	);

export const landscapeEnvironmentResponseSchema: z.ZodType<LandscapeEnvironment> =
	z
		.object({
			id: idSchema,
			landscape_id: idSchema.describe(
				'Landscape this environment belongs to.',
			),
			environment_name: z
				.string()
				.describe('Environment name, e.g. dev, tst, prod.'),
			hosting_provider: z
				.string()
				.describe(
					'Hosting provider code, e.g. AWS, AZURE, GCP, ONPREM.',
				),
			provider_account_name: nullableText(
				'Account or subscription name at the provider.',
			),
			provider_account_number: nullableText(
				'Account or subscription id at the provider.',
			),
			direct_link: nullableText('Console link for the account.'),
			...auditShape,
		})
		.describe('An environment within a landscape, hosted at one provider.');

export const resourceResponseSchema: z.ZodType<Resource> = z
	.object({
		id: idSchema,
		landscape_id: idSchema.describe('Landscape the resource lives in.'),
		landscape_environment_id: idSchema.describe(
			'Environment the resource lives in. Must belong to landscape_id.',
		),
		application_id: idSchema
			.nullable()
			.describe(
				'Owning application. Set when resource_scope is APPLICATION, null when ENVIRONMENT.',
			),
		resource_scope: z
			.enum(['APPLICATION', 'ENVIRONMENT'])
			.describe(
				'APPLICATION: owned by one application. ENVIRONMENT: shared by the environment.',
			),
		name: z.string().describe('Resource name.'),
		description: nullableText('Free-text description.'),
		region: nullableText('Provider region, e.g. us-east-1.'),
		service: nullableText('Provider service, e.g. RDS, Lambda.'),
		resource_type: nullableText('Resource type within the service.'),
		provider_resource_id: nullableText(
			'Provider-native identifier, e.g. an ARN.',
		),
		...auditShape,
	})
	.describe('A cloud or on-prem resource in an environment.');

export const hostingProviderResponseSchema: z.ZodType<HostingProvider> = z
	.object({
		id: idSchema,
		code: z.string().describe('Immutable SCREAMING_SNAKE code, e.g. AWS.'),
		display_name: z.string().describe('Display name.'),
		description: nullableText('Free-text description.'),
		...auditShape,
	})
	.describe('A hosting provider that environments can reference by code.');

export const meResponseSchema = z
	.object({
		user: z.string().describe('Authenticated principal.'),
		role: z
			.enum(AUTH_ROLES)
			.describe('Effective role: viewer < app_editor < admin.'),
	})
	.describe('The caller identity as the API sees it.');

export const healthResponseSchema = z
	.object({ ok: z.literal(true) })
	.describe('Liveness check result.');

export const ERROR_CODES = [
	'NOT_FOUND',
	'CONFLICT',
	'VALIDATION_ERROR',
	'UNAUTHORIZED',
	'INSUFFICIENT_ROLE',
] as const;

export const errorResponseSchema = z
	.object({
		error: z.string().describe('Human-readable message.'),
		code: z
			.enum(ERROR_CODES)
			.optional()
			.describe('Machine-readable code, present on domain errors.'),
		details: z
			.object({
				formErrors: z.array(z.string()),
				fieldErrors: z.record(z.string(), z.array(z.string())),
			})
			.optional()
			.describe(
				'Per-field validation messages, present on 400s from schema validation.',
			),
		requestId: z
			.string()
			.optional()
			.describe('Request id to quote when reporting a 500.'),
	})
	.describe('Error body returned for every 4xx and 5xx response.');
