import type { z } from 'zod';
import {
	applicationResponseSchema,
	complianceTagSchema,
	dataClassSchema,
	errorResponseSchema,
	healthResponseSchema,
	hostingProviderResponseSchema,
	landscapeEnvironmentResponseSchema,
	landscapeResponseSchema,
	meResponseSchema,
	resourceResponseSchema,
} from '../response-schemas.js';
import {
	createApplicationSchema,
	createHostingProviderSchema,
	createLandscapeEnvironmentSchema,
	createLandscapeSchema,
	createResourceSchema,
	updateApplicationSchema,
	updateHostingProviderSchema,
	updateLandscapeEnvironmentSchema,
	updateLandscapeSchema,
	updateResourceSchema,
} from '../schemas.js';

/**
 * Every schema that becomes a named entry under `components.schemas`. The key
 * is the component name; operations refer to schemas by these keys, so a typo
 * in an operation is a compile error rather than a dangling `$ref`.
 *
 * Request schemas are rendered from their *input* side (what a client sends,
 * before trimming or upper-casing transforms run).
 */
export const COMPONENT_SCHEMAS = {
	DataClass: dataClassSchema,
	ComplianceTag: complianceTagSchema,
	Application: applicationResponseSchema,
	CreateApplicationRequest: createApplicationSchema,
	UpdateApplicationRequest: updateApplicationSchema,
	Landscape: landscapeResponseSchema,
	CreateLandscapeRequest: createLandscapeSchema,
	UpdateLandscapeRequest: updateLandscapeSchema,
	LandscapeEnvironment: landscapeEnvironmentResponseSchema,
	CreateLandscapeEnvironmentRequest: createLandscapeEnvironmentSchema,
	UpdateLandscapeEnvironmentRequest: updateLandscapeEnvironmentSchema,
	Resource: resourceResponseSchema,
	CreateResourceRequest: createResourceSchema,
	UpdateResourceRequest: updateResourceSchema,
	HostingProvider: hostingProviderResponseSchema,
	CreateHostingProviderRequest: createHostingProviderSchema,
	UpdateHostingProviderRequest: updateHostingProviderSchema,
	Me: meResponseSchema,
	Health: healthResponseSchema,
	Error: errorResponseSchema,
} as const satisfies Record<string, z.ZodType>;

export type ComponentSchemaName = keyof typeof COMPONENT_SCHEMAS;
