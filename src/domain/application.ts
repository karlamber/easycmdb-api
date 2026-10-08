import type { ComplianceTag } from './compliance.js';
import type { DataClass } from './data-class.js';

export type ApplicationId = string;

export type Application = {
	id: ApplicationId;
	app_alias: string;
	business_name: string | null;
	description: string | null;
	data_class: DataClass | null;
	/**
	 * Compliance frameworks / regulatory tags this application is subject to.
	 * Always an array (possibly empty) - the DB column is NOT NULL DEFAULT '{}'
	 * so the API never has to surface a null/undefined distinction.
	 */
	compliance: ComplianceTag[];
	business_contact: string | null;
	development_contact: string | null;
	support_contact: string | null;
	source_repository: string | null;
	prod_url: string | null;
	runbook_url: string | null;
	is_active: boolean;
	created_at: string;
	updated_at: string;
	created_by: string | null;
	updated_by: string | null;
	deleted_by: string | null;
};

export type CreateApplicationInput = Omit<
	Application,
	| 'id'
	| 'created_at'
	| 'updated_at'
	| 'is_active'
	| 'created_by'
	| 'updated_by'
	| 'deleted_by'
> & { is_active?: boolean };

export type UpdateApplicationInput = Partial<
	Omit<
		Application,
		| 'id'
		| 'created_at'
		| 'updated_at'
		| 'created_by'
		| 'updated_by'
		| 'deleted_by'
	>
>;
