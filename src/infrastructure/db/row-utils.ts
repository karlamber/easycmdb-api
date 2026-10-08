export function idString(v: unknown): string {
	return String(v);
}

export function iso(v: unknown): string {
	if (v instanceof Date) {
		return v.toISOString();
	}
	return String(v);
}

export function nullableString(v: unknown): string | null {
	return v == null ? null : String(v);
}

export function auditUserFields(row: Record<string, unknown>): {
	created_by: string | null;
	updated_by: string | null;
	deleted_by: string | null;
} {
	return {
		created_by: nullableString(row.created_by),
		updated_by: nullableString(row.updated_by),
		deleted_by: nullableString(row.deleted_by),
	};
}
