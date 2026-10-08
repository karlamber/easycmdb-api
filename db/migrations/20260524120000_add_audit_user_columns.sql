-- Add audit user columns to track who created, updated, or soft-deleted rows.
-- Idempotent: safe to re-run when columns already exist.

ALTER TABLE argus.application
	ADD COLUMN IF NOT EXISTS created_by text,
	ADD COLUMN IF NOT EXISTS updated_by text,
	ADD COLUMN IF NOT EXISTS deleted_by text;

ALTER TABLE argus.landscape
	ADD COLUMN IF NOT EXISTS created_by text,
	ADD COLUMN IF NOT EXISTS updated_by text,
	ADD COLUMN IF NOT EXISTS deleted_by text;

ALTER TABLE argus.landscape_environment
	ADD COLUMN IF NOT EXISTS created_by text,
	ADD COLUMN IF NOT EXISTS updated_by text,
	ADD COLUMN IF NOT EXISTS deleted_by text;

ALTER TABLE argus.resource
	ADD COLUMN IF NOT EXISTS created_by text,
	ADD COLUMN IF NOT EXISTS updated_by text,
	ADD COLUMN IF NOT EXISTS deleted_by text;

COMMENT ON COLUMN argus.application.created_by IS
	'Principal who created the row (email or username from auth)';
COMMENT ON COLUMN argus.application.updated_by IS
	'Principal who last updated the row';
COMMENT ON COLUMN argus.application.deleted_by IS
	'Principal who soft-deleted the row (is_active = false)';
