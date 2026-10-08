-- Hosting provider lookup table for landscape environments.
--
-- Replaces the hard-coded CHECK (AWS, AZURE) with a managed list so admins
-- can add providers (GCP, OnPrem, …) without an API redeploy. Environments
-- keep storing the provider *code* as text; a FK enforces that the code
-- exists. Soft-delete is application-enforced (blocked while any environment
-- still references the code).
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS argus.hosting_provider (
	id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
	code text NOT NULL,
	display_name text NOT NULL,
	description text NULL,
	is_active bool DEFAULT true NOT NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	updated_at timestamptz DEFAULT now() NOT NULL,
	created_by text NULL,
	updated_by text NULL,
	deleted_by text NULL,
	CONSTRAINT hosting_provider_pkey PRIMARY KEY (id),
	CONSTRAINT uq_hosting_provider_code UNIQUE (code),
	CONSTRAINT chk_hosting_provider_code_not_blank CHECK (btrim(code) <> ''),
	CONSTRAINT chk_hosting_provider_display_name_not_blank CHECK (
		btrim(display_name) <> ''
	)
);

CREATE INDEX IF NOT EXISTS ix_hosting_provider_is_active
	ON argus.hosting_provider USING btree (is_active);

DROP TRIGGER IF EXISTS tr_hosting_provider_set_updated_at ON argus.hosting_provider;
CREATE TRIGGER tr_hosting_provider_set_updated_at
	BEFORE UPDATE ON argus.hosting_provider
	FOR EACH ROW
	EXECUTE FUNCTION argus.set_updated_at();

ALTER TABLE argus.hosting_provider OWNER TO postgres;

GRANT SELECT, INSERT, UPDATE, DELETE ON argus.hosting_provider TO argus_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA argus TO argus_app;

INSERT INTO argus.hosting_provider (code, display_name, description)
VALUES
	('AWS', 'AWS', 'Amazon Web Services'),
	('AZURE', 'Azure', 'Microsoft Azure'),
	('GCP', 'GCP', 'Google Cloud Platform'),
	('ONPREM', 'OnPrem', 'On-premises / private data center')
ON CONFLICT (code) DO NOTHING;

-- Drop the hard-coded AWS/AZURE check so new codes are allowed.
ALTER TABLE argus.landscape_environment
	DROP CONSTRAINT IF EXISTS chk_landscape_environment_hosting_provider;

-- Point environments at the lookup table (RESTRICT keeps orphan codes out).
ALTER TABLE argus.landscape_environment
	DROP CONSTRAINT IF EXISTS fk_landscape_environment_hosting_provider;

ALTER TABLE argus.landscape_environment
	ADD CONSTRAINT fk_landscape_environment_hosting_provider
	FOREIGN KEY (hosting_provider)
	REFERENCES argus.hosting_provider (code)
	ON UPDATE CASCADE
	ON DELETE RESTRICT;

COMMENT ON TABLE argus.hosting_provider IS
	'Managed cloud/on-prem hosting providers. landscape_environment.hosting_provider '
	'stores hosting_provider.code.';
