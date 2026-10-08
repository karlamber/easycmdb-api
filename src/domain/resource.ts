import type { ApplicationId } from './application.js';
import type { LandscapeEnvironmentId } from './landscape-environment.js';
import type { LandscapeId } from './landscape.js';

export type ResourceId = string;

export type ResourceScope = 'APPLICATION' | 'ENVIRONMENT';

export type Resource = {
	id: ResourceId;
	landscape_id: LandscapeId;
	landscape_environment_id: LandscapeEnvironmentId;
	application_id: ApplicationId | null;
	resource_scope: ResourceScope;
	name: string;
	description: string | null;
	region: string | null;
	service: string | null;
	resource_type: string | null;
	provider_resource_id: string | null;
	is_active: boolean;
	created_at: string;
	updated_at: string;
	created_by: string | null;
	updated_by: string | null;
	deleted_by: string | null;
};

export type CreateResourceInput = Omit<
	Resource,
	| 'id'
	| 'created_at'
	| 'updated_at'
	| 'is_active'
	| 'created_by'
	| 'updated_by'
	| 'deleted_by'
> & { is_active?: boolean };

export type UpdateResourceInput = Partial<
	Omit<
		Resource,
		| 'id'
		| 'created_at'
		| 'updated_at'
		| 'created_by'
		| 'updated_by'
		| 'deleted_by'
	>
>;
