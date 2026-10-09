-- easyCMDB — bootstrap a new Postgres database.
--
-- Creates the argus schema, the five inventory tables, the hosting-provider
-- seed rows, and the schema_migrations stamps. After this file, `npm run migrate`
-- is a no-op until a later migration is added.
--
-- Local:
--   createdb easycmdb
--   psql -d easycmdb -f db/bootstrap.sql
--
-- Idempotent (CREATE IF NOT EXISTS). This file does not ALTER existing tables.
-- Re-running it will not evolve a database that already has data. Use
-- db/migrations/ for that.
--
-- Aurora copies live in the landscape repos as argus/rds/initial-config.sql.
-- Those files match this schema and also create the argus_app / argus_lambda
-- roles. A commented copy of that role block is at the bottom of this file.

CREATE SCHEMA IF NOT EXISTS argus;

CREATE OR REPLACE FUNCTION argus.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	NEW.updated_at := now();
	RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- argus.application
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS argus.application (
	id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
	app_alias text NOT NULL,
	business_name text NULL,
	description text NULL,
	data_class text NULL,
	compliance text[] NOT NULL DEFAULT '{}',
	business_contact text NULL,
	development_contact text NULL,
	support_contact text NULL,
	source_repository text NULL,
	prod_url text NULL,
	runbook_url text NULL,
	is_active bool DEFAULT true NOT NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	updated_at timestamptz DEFAULT now() NOT NULL,
	created_by text NULL,
	updated_by text NULL,
	deleted_by text NULL,
	CONSTRAINT application_pkey PRIMARY KEY (id),
	CONSTRAINT chk_application_alias_not_blank CHECK (btrim(app_alias) <> ''),
	CONSTRAINT chk_application_data_classification CHECK (
		data_class IS NULL
		OR data_class IN ('PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED')
	),
	CONSTRAINT uq_application_alias UNIQUE (app_alias)
);
CREATE INDEX IF NOT EXISTS ix_application_is_active ON argus.application USING btree (is_active);

COMMENT ON COLUMN argus.application.compliance IS
	'Compliance frameworks / regulatory tags this application is subject to '
	'(e.g. HIPAA, CJIS, GDPR). Validated against domain/compliance.ts at the '
	'API edge; stored as text[] so the canonical list can evolve without DDL.';
COMMENT ON COLUMN argus.application.created_by IS
	'Principal who created the row (email or username from auth)';
COMMENT ON COLUMN argus.application.updated_by IS
	'Principal who last updated the row';
COMMENT ON COLUMN argus.application.deleted_by IS
	'Principal who soft-deleted the row (is_active = false)';

DROP TRIGGER IF EXISTS tr_application_set_updated_at ON argus.application;
CREATE TRIGGER tr_application_set_updated_at
	BEFORE UPDATE ON argus.application
	FOR EACH ROW
	EXECUTE FUNCTION argus.set_updated_at();


-- ---------------------------------------------------------------------------
-- argus.landscape
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS argus.landscape (
	id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
	name text NOT NULL,
	description text NULL,
	organization text NULL,
	devops_contact text NULL,
	data_class text NULL,
	runbook_url text NULL,
	iac_repository text NULL,
	is_active bool DEFAULT true NOT NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	updated_at timestamptz DEFAULT now() NOT NULL,
	created_by text NULL,
	updated_by text NULL,
	deleted_by text NULL,
	CONSTRAINT landscape_pkey PRIMARY KEY (id),
	CONSTRAINT chk_landscape_name_not_blank CHECK (btrim(name) <> ''),
	CONSTRAINT chk_landscape_data_classification CHECK (
		data_class IS NULL
		OR data_class IN ('PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED')
	),
	CONSTRAINT uq_landscape_name UNIQUE (name)
);
CREATE INDEX IF NOT EXISTS ix_landscape_is_active ON argus.landscape USING btree (is_active);

DROP TRIGGER IF EXISTS tr_landscape_set_updated_at ON argus.landscape;
CREATE TRIGGER tr_landscape_set_updated_at
	BEFORE UPDATE ON argus.landscape
	FOR EACH ROW
	EXECUTE FUNCTION argus.set_updated_at();


-- ---------------------------------------------------------------------------
-- argus.hosting_provider (lookup for landscape_environment.hosting_provider)
-- ---------------------------------------------------------------------------

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


INSERT INTO argus.hosting_provider (code, display_name, description)
VALUES
	('AWS', 'AWS', 'Amazon Web Services'),
	('AZURE', 'Azure', 'Microsoft Azure'),
	('GCP', 'GCP', 'Google Cloud Platform'),
	('ONPREM', 'OnPrem', 'On-premises / private data center')
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- argus.landscape_environment
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS argus.landscape_environment (
	id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
	landscape_id bigint NOT NULL,
	environment_name text NOT NULL,
	hosting_provider text NOT NULL,
	provider_account_name text NULL,
	provider_account_number text NULL,
	direct_link text NULL,
	is_active bool DEFAULT true NOT NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	updated_at timestamptz DEFAULT now() NOT NULL,
	created_by text NULL,
	updated_by text NULL,
	deleted_by text NULL,
	CONSTRAINT landscape_environment_pkey PRIMARY KEY (id),
	CONSTRAINT chk_landscape_environment_account_name_not_blank CHECK (
		provider_account_name IS NULL OR btrim(provider_account_name) <> ''
	),
	CONSTRAINT chk_landscape_environment_account_number_not_blank CHECK (
		provider_account_number IS NULL OR btrim(provider_account_number) <> ''
	),
	CONSTRAINT chk_landscape_environment_name_not_blank CHECK (
		btrim(environment_name) <> ''
	),
	CONSTRAINT uq_landscape_environment_id_landscape UNIQUE (id, landscape_id),
	CONSTRAINT uq_landscape_environment_name UNIQUE (landscape_id, environment_name),
	CONSTRAINT uq_landscape_environment_provider_account UNIQUE (
		hosting_provider, provider_account_number
	),
	CONSTRAINT fk_landscape_environment_landscape FOREIGN KEY (landscape_id)
		REFERENCES argus.landscape(id) ON DELETE CASCADE,
	CONSTRAINT fk_landscape_environment_hosting_provider FOREIGN KEY (hosting_provider)
		REFERENCES argus.hosting_provider(code) ON UPDATE CASCADE ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS ix_landscape_environment_is_active
	ON argus.landscape_environment USING btree (is_active);
CREATE INDEX IF NOT EXISTS ix_landscape_environment_landscape_id
	ON argus.landscape_environment USING btree (landscape_id);

DROP TRIGGER IF EXISTS tr_landscape_environment_set_updated_at ON argus.landscape_environment;
CREATE TRIGGER tr_landscape_environment_set_updated_at
	BEFORE UPDATE ON argus.landscape_environment
	FOR EACH ROW
	EXECUTE FUNCTION argus.set_updated_at();


-- ---------------------------------------------------------------------------
-- argus.resource
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS argus.resource (
	id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
	landscape_id bigint NOT NULL,
	landscape_environment_id bigint NOT NULL,
	application_id bigint NULL,
	resource_scope text NOT NULL,
	name text NOT NULL,
	description text NULL,
	region text NULL,
	service text NULL,
	resource_type text NULL,
	provider_resource_id text NULL,
	is_active bool DEFAULT true NOT NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	updated_at timestamptz DEFAULT now() NOT NULL,
	created_by text NULL,
	updated_by text NULL,
	deleted_by text NULL,
	CONSTRAINT resource_pkey PRIMARY KEY (id),
	CONSTRAINT chk_resource_name_not_blank CHECK (btrim(name) <> ''),
	CONSTRAINT chk_resource_region_not_blank CHECK (region IS NULL OR btrim(region) <> ''),
	CONSTRAINT chk_resource_scope CHECK (resource_scope IN ('APPLICATION', 'ENVIRONMENT')),
	CONSTRAINT chk_resource_scope_application_match CHECK (
		(resource_scope = 'APPLICATION' AND application_id IS NOT NULL)
		OR (resource_scope = 'ENVIRONMENT' AND application_id IS NULL)
	),
	CONSTRAINT chk_resource_service_not_blank CHECK (service IS NULL OR btrim(service) <> ''),
	CONSTRAINT chk_resource_type_not_blank CHECK (resource_type IS NULL OR btrim(resource_type) <> ''),
	CONSTRAINT uq_resource_env_provider_resource_id UNIQUE (
		landscape_environment_id, provider_resource_id
	),
	CONSTRAINT fk_resource_application FOREIGN KEY (application_id)
		REFERENCES argus.application(id) ON DELETE RESTRICT,
	CONSTRAINT fk_resource_environment_same_landscape FOREIGN KEY (
		landscape_environment_id, landscape_id
	) REFERENCES argus.landscape_environment(id, landscape_id) ON DELETE RESTRICT,
	CONSTRAINT fk_resource_landscape FOREIGN KEY (landscape_id)
		REFERENCES argus.landscape(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS ix_resource_application_id ON argus.resource USING btree (application_id);
CREATE INDEX IF NOT EXISTS ix_resource_landscape_environment_id
	ON argus.resource USING btree (landscape_environment_id);
CREATE INDEX IF NOT EXISTS ix_resource_landscape_id ON argus.resource USING btree (landscape_id);
CREATE INDEX IF NOT EXISTS ix_resource_region ON argus.resource USING btree (region);
CREATE INDEX IF NOT EXISTS ix_resource_scope ON argus.resource USING btree (resource_scope);
CREATE INDEX IF NOT EXISTS ix_resource_service ON argus.resource USING btree (service);
CREATE INDEX IF NOT EXISTS ix_resource_type ON argus.resource USING btree (resource_type);
CREATE INDEX IF NOT EXISTS ix_resource_is_active ON argus.resource USING btree (is_active);

DROP TRIGGER IF EXISTS tr_resource_set_updated_at ON argus.resource;
CREATE TRIGGER tr_resource_set_updated_at
	BEFORE UPDATE ON argus.resource
	FOR EACH ROW
	EXECUTE FUNCTION argus.set_updated_at();

-- ---------------------------------------------------------------------------
-- Migration bookkeeping (scripts/migrate.mjs)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS argus.schema_migrations (
	version text PRIMARY KEY,
	applied_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO argus.schema_migrations (version) VALUES
	('20260524120000_add_audit_user_columns'),
	('20260602143600_add_application_compliance_column'),
	('20260908150000_hosting_provider_lookup')
ON CONFLICT (version) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Aurora roles (not applied above)
--
-- A local database can use the user you connected as. On Aurora, run the
-- landscape initial-config.sql, which creates argus_app (NOLOGIN) and
-- argus_lambda (LOGIN) and grants DML on the argus schema to argus_app.
-- Set the login password outside git:
--   ALTER ROLE argus_lambda PASSWORD '<value matching Lambda PGPASSWORD>';
-- ---------------------------------------------------------------------------
