export type HostingProviderId = string;

/**
 * Stable lookup code stored on landscape_environment.hosting_provider.
 * Prefer SCREAMING_SNAKE (AWS, AZURE, GCP, ONPREM).
 */
export type HostingProviderCode = string;

export type HostingProvider = {
	id: HostingProviderId;
	code: HostingProviderCode;
	display_name: string;
	description: string | null;
	is_active: boolean;
	created_at: string;
	updated_at: string;
	created_by: string | null;
	updated_by: string | null;
	deleted_by: string | null;
};

export type CreateHostingProviderInput = {
	code: HostingProviderCode;
	display_name: string;
	description: string | null;
	is_active?: boolean;
};

export type UpdateHostingProviderInput = Partial<{
	display_name: string;
	description: string | null;
	is_active: boolean;
}>;
