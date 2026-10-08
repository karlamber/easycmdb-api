import type { DataClass } from './data-class.js';

export type LandscapeId = string;

export type Landscape = {
	id: LandscapeId;
	name: string;
	description: string | null;
	organization: string | null;
	devops_contact: string | null;
	data_class: DataClass | null;
	runbook_url: string | null;
	iac_repository: string | null;
	is_active: boolean;
	created_at: string;
	updated_at: string;
	created_by: string | null;
	updated_by: string | null;
	deleted_by: string | null;
};

export type CreateLandscapeInput = Omit<
	Landscape,
	| 'id'
	| 'created_at'
	| 'updated_at'
	| 'is_active'
	| 'created_by'
	| 'updated_by'
	| 'deleted_by'
> & { is_active?: boolean };

export type UpdateLandscapeInput = Partial<
	Omit<
		Landscape,
		| 'id'
		| 'created_at'
		| 'updated_at'
		| 'created_by'
		| 'updated_by'
		| 'deleted_by'
	>
>;
