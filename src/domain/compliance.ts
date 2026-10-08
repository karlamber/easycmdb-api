/**
 * Canonical compliance / regulatory tag list applied at the application level.
 *
 * Curated for workloads where applications handle regulated or sensitive data.
 * Every tag here is one the business would plausibly need to assert about an
 * application that stores, processes, or transmits constrained information.
 *
 * The list is stored in code (rather than as a Postgres enum) so the team
 * can add/retire tags without a paired DDL migration. The DB column is
 * `argus.application.compliance text[]`; this enum is the source of truth
 * that the API enforces via Zod.
 *
 * Keep entries SCREAMING_SNAKE_CASE so they are unambiguous tokens in the
 * payload, even when the human-readable label needs hyphens or punctuation.
 */
export const COMPLIANCE_TAGS = [
	// --- General privacy / personal data ---
	'PII',
	'PHI',
	// --- Confidentiality agreements ---
	'SEALED',
	'NDA',
	// --- US regulatory frameworks ---
	'HIPAA',
	'CJIS',
	'CMMC',
	'CCPA',
	'SOC2',
	// --- EU privacy ---
	'GDPR',
] as const;

export type ComplianceTag = (typeof COMPLIANCE_TAGS)[number];

const COMPLIANCE_TAG_SET: ReadonlySet<string> = new Set(COMPLIANCE_TAGS);

export function isComplianceTag(value: unknown): value is ComplianceTag {
	return typeof value === 'string' && COMPLIANCE_TAG_SET.has(value);
}

/**
 * Normalize a value read back from the database into a clean ComplianceTag[]:
 * - tolerate NULL (legacy rows / pre-migration reads) → []
 * - drop any unknown strings rather than crashing, so an out-of-band UPDATE
 *   that introduced an obsolete tag does not break the GET path
 * - de-duplicate while preserving first-seen order so the UI is stable
 */
export function coerceComplianceTags(value: unknown): ComplianceTag[] {
	if (!Array.isArray(value)) {
		return [];
	}
	const seen = new Set<ComplianceTag>();
	const out: ComplianceTag[] = [];
	for (const v of value) {
		if (isComplianceTag(v) && !seen.has(v)) {
			seen.add(v);
			out.push(v);
		}
	}
	return out;
}
