import type { AuthIdentity, AuthRole } from './basic-auth.js';

/**
 * Shape of claims forwarded by the API Gateway HTTP API JWT authorizer. The
 * authorizer parses the Bearer token, validates its signature against the
 * Cognito JWKS, checks `iss`/`aud`/`exp`, and exposes the verified claims at
 * `event.requestContext.authorizer.jwt.claims` for downstream integrations.
 *
 * We intentionally type this as a loose record because Cognito's claim set
 * varies (ID token vs access token, SAML-federated vs local, custom claims
 * named per-pool). Field access is guarded below.
 */
export type JwtClaims = Record<string, unknown>;

export type RoleMappingConfig = {
	adminClaimValue: string;
	appEditorClaimValue: string;
	viewerClaimValue: string;
};

/**
 * Read a claim and return its string form. Cognito sometimes emits arrays for
 * group/role claims and sometimes strings; both should be tolerated.
 */
function readStringClaim(claims: JwtClaims, name: string): string | undefined {
	const value = claims[name];
	if (typeof value === 'string' && value.length > 0) {
		return value;
	}
	return undefined;
}

function readStringArrayClaim(claims: JwtClaims, name: string): string[] {
	const value = claims[name];
	if (Array.isArray(value)) {
		return value.filter((v): v is string => typeof v === 'string');
	}
	if (typeof value === 'string' && value.length > 0) {
		// Cognito serialises some array claims (e.g. cognito:groups) as a
		// stringified JSON array like "[admin,viewer]" or as a comma/space-
		// separated list. Support both, plus the common SAML pattern of a
		// single value forwarded as a bare string.
		const trimmed = value.trim();
		if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
			return trimmed
				.slice(1, -1)
				.split(',')
				.map((s) => s.trim())
				.filter((s) => s.length > 0);
		}
		return trimmed
			.split(/[,\s]+/)
			.map((s) => s.trim())
			.filter((s) => s.length > 0);
	}
	return [];
}

function pickUserIdentifier(claims: JwtClaims): string | undefined {
	return (
		readStringClaim(claims, 'email') ??
		readStringClaim(claims, 'cognito:username') ??
		readStringClaim(claims, 'username') ??
		readStringClaim(claims, 'sub')
	);
}

function pickRoleTokens(claims: JwtClaims): string[] {
	// `custom:roles` arrives from the SAML mapping in tf-cognito; for direct
	// Cognito pools `cognito:groups` is the conventional source. Concatenate
	// so either mechanism works without per-pool configuration.
	return [
		...readStringArrayClaim(claims, 'custom:roles'),
		...readStringArrayClaim(claims, 'cognito:groups'),
	];
}

/**
 * Build an AuthIdentity from JWT claims, or null if no usable user identifier
 * can be extracted. Role mapping (case-sensitive, in priority order):
 *
 *   1. Any token equal to `adminClaimValue`         -> admin
 *   2. Any token equal to `appEditorClaimValue`     -> app_editor
 *   3. Otherwise                                    -> viewer
 *
 * Admin wins when a user carries both an admin and an app-editor token (e.g.
 * during a role migration). Unknown role tokens are ignored - the authorizer
 * has already proven the JWT is valid, so an authenticated user with no
 * recognized role still gets viewer access.
 */
export function identityFromJwtClaims(
	claims: JwtClaims | null | undefined,
	mapping: RoleMappingConfig,
): AuthIdentity | null {
	if (!claims) {
		return null;
	}
	const user = pickUserIdentifier(claims);
	if (!user) {
		return null;
	}
	const tokens = pickRoleTokens(claims);
	let role: AuthRole = 'viewer';
	if (tokens.includes(mapping.adminClaimValue)) {
		role = 'admin';
	} else if (tokens.includes(mapping.appEditorClaimValue)) {
		role = 'app_editor';
	}
	return { user, role };
}
