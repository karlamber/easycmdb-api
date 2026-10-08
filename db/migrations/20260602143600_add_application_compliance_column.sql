-- Add a compliance tag column to applications.
--
-- Stored as text[] (not a Postgres enum) to mirror how data_class is handled:
-- the canonical tag list lives in src/domain/compliance.ts and is enforced by
-- Zod at the HTTP edge. Keeping it text[] makes it cheap to add/retire tags
-- (e.g. when new regulations or industry codes apply) without paired DDL.
--
-- An app can carry multiple tags simultaneously - in court reporting work it
-- is common for the same case data to be subject to HIPAA + GDPR + CJIS, etc.
--
-- Idempotent: safe to re-run when the column already exists.

ALTER TABLE argus.application
	ADD COLUMN IF NOT EXISTS compliance text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN argus.application.compliance IS
	'Compliance frameworks / regulatory tags this application is subject to '
	'(e.g. HIPAA, CJIS, GDPR). Validated against domain/compliance.ts at the '
	'API edge; stored as text[] so the canonical list can evolve without DDL.';
