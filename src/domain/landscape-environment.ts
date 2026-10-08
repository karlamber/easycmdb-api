export type LandscapeEnvironmentId = string;

/** Provider code from argus.hosting_provider.code (e.g. AWS, AZURE, GCP, ONPREM). */
export type HostingProviderCode = string;

export type LandscapeEnvironment = {
	id: LandscapeEnvironmentId;
	landscape_id: string;
	environment_name: string;
	hosting_provider: HostingProviderCode;
	provider_account_name: string | null;
	provider_account_number: string | null;
	direct_link: string | null;
	is_active: boolean;
	created_at: string;
	updated_at: string;
	created_by: string | null;
	updated_by: string | null;
	deleted_by: string | null;
};

export type CreateLandscapeEnvironmentInput = Omit<
	LandscapeEnvironment,
	| 'id'
	| 'created_at'
	| 'updated_at'
	| 'is_active'
	| 'created_by'
	| 'updated_by'
	| 'deleted_by'
> & { is_active?: boolean };

export type UpdateLandscapeEnvironmentInput = Partial<
	Omit<
		LandscapeEnvironment,
		| 'id'
		| 'created_at'
		| 'updated_at'
		| 'created_by'
		| 'updated_by'
		| 'deleted_by'
	>
>;
