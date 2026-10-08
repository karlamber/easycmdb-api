import { z } from 'zod';
import type { CreateApplicationInput } from '../../domain/application.js';
import { COMPLIANCE_TAGS } from '../../domain/compliance.js';
import { DATA_CLASSES } from '../../domain/data-class.js';
import type { CreateLandscapeEnvironmentInput } from '../../domain/landscape-environment.js';
import type { CreateHostingProviderInput } from '../../domain/hosting-provider.js';
import type { CreateLandscapeInput } from '../../domain/landscape.js';
import type { CreateResourceInput } from '../../domain/resource.js';

const dataClassSchema = z.enum(DATA_CLASSES).nullable();

/**
 * Compliance is an unordered set of distinct tags. We accept a plain JSON
 * array on the wire and de-duplicate while preserving first-seen order so
 * round-trips through the API produce a stable representation regardless of
 * how the client built the request body.
 *
 * Null and undefined both collapse to the empty array - matches the DB
 * column (NOT NULL DEFAULT '{}') so clients never need to special-case
 * "compliance was not set".
 */
const complianceSchema = z
	.array(z.enum(COMPLIANCE_TAGS))
	.nullable()
	.optional()
	.transform((arr) => {
		if (!arr) return [];
		const seen = new Set<(typeof COMPLIANCE_TAGS)[number]>();
		const out: (typeof COMPLIANCE_TAGS)[number][] = [];
		for (const tag of arr) {
			if (!seen.has(tag)) {
				seen.add(tag);
				out.push(tag);
			}
		}
		return out;
	});

const idParamSchema = z.string().regex(/^\d+$/);

export const applicationIdParamSchema = z.object({
	id: idParamSchema,
});

export const createApplicationSchema = z.object({
	app_alias: z
		.string()
		.transform((s) => s.trim())
		.pipe(z.string().min(1, 'app_alias cannot be blank')),
	business_name: z.string().nullable().optional(),
	description: z.string().nullable().optional(),
	data_class: dataClassSchema.optional(),
	compliance: complianceSchema,
	business_contact: z.string().nullable().optional(),
	development_contact: z.string().nullable().optional(),
	support_contact: z.string().nullable().optional(),
	source_repository: z.string().nullable().optional(),
	prod_url: z.string().nullable().optional(),
	runbook_url: z.string().nullable().optional(),
	is_active: z.boolean().optional(),
});

export const updateApplicationSchema = createApplicationSchema.partial();

export const createLandscapeSchema = z.object({
	name: z
		.string()
		.transform((s) => s.trim())
		.pipe(z.string().min(1, 'name cannot be blank')),
	description: z.string().nullable().optional(),
	organization: z.string().nullable().optional(),
	devops_contact: z.string().nullable().optional(),
	data_class: dataClassSchema.optional(),
	runbook_url: z.string().nullable().optional(),
	iac_repository: z.string().nullable().optional(),
	is_active: z.boolean().optional(),
});

export const updateLandscapeSchema = createLandscapeSchema.partial();

export const createLandscapeEnvironmentSchema = z.object({
	landscape_id: idParamSchema,
	environment_name: z
		.string()
		.transform((s) => s.trim())
		.pipe(z.string().min(1, 'environment_name cannot be blank')),
	hosting_provider: z
		.string()
		.transform((s) => s.trim().toUpperCase())
		.pipe(z.string().min(1, 'hosting_provider cannot be blank')),
	provider_account_name: z.string().nullable().optional(),
	provider_account_number: z.string().nullable().optional(),
	direct_link: z.string().nullable().optional(),
	is_active: z.boolean().optional(),
});

export const updateLandscapeEnvironmentSchema = createLandscapeEnvironmentSchema
	.omit({ landscape_id: true })
	.partial()
	.extend({
		landscape_id: idParamSchema.optional(),
	});

export const createHostingProviderSchema = z.object({
	code: z
		.string()
		.transform((s) => s.trim().toUpperCase())
		.pipe(
			z
				.string()
				.min(1, 'code cannot be blank')
				.regex(
					/^[A-Z][A-Z0-9_]*$/,
					'code must be SCREAMING_SNAKE (letters, digits, underscore)',
				),
		),
	display_name: z
		.string()
		.transform((s) => s.trim())
		.pipe(z.string().min(1, 'display_name cannot be blank')),
	description: z.string().nullable().optional(),
	is_active: z.boolean().optional(),
});

export const updateHostingProviderSchema = z.object({
	display_name: z
		.string()
		.transform((s) => s.trim())
		.pipe(z.string().min(1, 'display_name cannot be blank'))
		.optional(),
	description: z.string().nullable().optional(),
	is_active: z.boolean().optional(),
});

export const createResourceSchema = z.object({
	landscape_id: idParamSchema,
	landscape_environment_id: idParamSchema,
	application_id: idParamSchema.nullable().optional(),
	resource_scope: z.enum(['APPLICATION', 'ENVIRONMENT']),
	name: z
		.string()
		.transform((s) => s.trim())
		.pipe(z.string().min(1, 'name cannot be blank')),
	description: z.string().nullable().optional(),
	region: z.string().nullable().optional(),
	service: z.string().nullable().optional(),
	resource_type: z.string().nullable().optional(),
	provider_resource_id: z.string().nullable().optional(),
	is_active: z.boolean().optional(),
});

export const updateResourceSchema = createResourceSchema.partial();

export function toCreateApplicationInput(
	parsed: z.infer<typeof createApplicationSchema>,
): CreateApplicationInput {
	return {
		app_alias: parsed.app_alias,
		business_name: parsed.business_name ?? null,
		description: parsed.description ?? null,
		data_class: parsed.data_class ?? null,
		compliance: parsed.compliance ?? [],
		business_contact: parsed.business_contact ?? null,
		development_contact: parsed.development_contact ?? null,
		support_contact: parsed.support_contact ?? null,
		source_repository: parsed.source_repository ?? null,
		prod_url: parsed.prod_url ?? null,
		runbook_url: parsed.runbook_url ?? null,
		is_active: parsed.is_active,
	};
}

export function toCreateLandscapeInput(
	parsed: z.infer<typeof createLandscapeSchema>,
): CreateLandscapeInput {
	return {
		name: parsed.name,
		description: parsed.description ?? null,
		organization: parsed.organization ?? null,
		devops_contact: parsed.devops_contact ?? null,
		data_class: parsed.data_class ?? null,
		runbook_url: parsed.runbook_url ?? null,
		iac_repository: parsed.iac_repository ?? null,
		is_active: parsed.is_active,
	};
}

export function toCreateLandscapeEnvironmentInput(
	parsed: z.infer<typeof createLandscapeEnvironmentSchema>,
): CreateLandscapeEnvironmentInput {
	return {
		landscape_id: parsed.landscape_id,
		environment_name: parsed.environment_name,
		hosting_provider: parsed.hosting_provider,
		provider_account_name: parsed.provider_account_name ?? null,
		provider_account_number: parsed.provider_account_number ?? null,
		direct_link: parsed.direct_link ?? null,
		is_active: parsed.is_active,
	};
}

export function toCreateHostingProviderInput(
	parsed: z.infer<typeof createHostingProviderSchema>,
): CreateHostingProviderInput {
	return {
		code: parsed.code,
		display_name: parsed.display_name,
		description: parsed.description ?? null,
		is_active: parsed.is_active,
	};
}

export function toCreateResourceInput(
	parsed: z.infer<typeof createResourceSchema>,
): CreateResourceInput {
	return {
		landscape_id: parsed.landscape_id,
		landscape_environment_id: parsed.landscape_environment_id,
		application_id: parsed.application_id ?? null,
		resource_scope: parsed.resource_scope,
		name: parsed.name,
		description: parsed.description ?? null,
		region: parsed.region ?? null,
		service: parsed.service ?? null,
		resource_type: parsed.resource_type ?? null,
		provider_resource_id: parsed.provider_resource_id ?? null,
		is_active: parsed.is_active,
	};
}

export function parseIncludeInactive(queryString: string | undefined): boolean {
	const params = new URLSearchParams(queryString ?? '');
	const v = params.get('include_inactive');
	return v === 'true' || v === '1';
}

export function parseOptionalId(
	queryString: string | undefined,
	key: string,
): string | undefined {
	const params = new URLSearchParams(queryString ?? '');
	const raw = params.get(key);
	if (raw == null || raw === '') {
		return undefined;
	}
	return idParamSchema.parse(raw);
}
