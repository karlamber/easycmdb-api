### Issue

Link to the related issue or ticket (if applicable).

### Description

What changed and why.

### Test Evidence

How this was tested.

### Checklist

- [ ] Description provided
- [ ] Evidence provided
- [ ] If this change needs Postgres DDL: added `db/migrations/<timestamp>_<name>.sql` (additive, idempotent; did not edit older files)
- [ ] If this change needs Postgres DDL: folded end-state into landscape `initial-config.sql` and stamped `schema_migrations` (`npm run migrate:stamps` / `migrate:check-bootstrap`)
- [ ] If this change needs Postgres DDL: target env will apply SQL **before** Lambda code that requires the new shape
