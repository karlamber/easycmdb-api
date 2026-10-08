import { timingSafeEqual } from 'node:crypto';

/**
 * Internal role tokens.
 *
 *   admin       - Full CRUD across every resource.
 *   app_editor  - CRUD restricted to the Applications resource (used to let
 *                 application owners curate their own metadata without giving
 *                 them write access to Landscapes/Environments/Resources).
 *   viewer      - Read-only.
 *
 * Mapping from external claim values to these tokens lives in jwt-auth.ts
 * (Cognito JWT) and in buildAccounts() (HTTP Basic, admin/viewer only).
 */
export type AuthRole = 'admin' | 'app_editor' | 'viewer';

export type AuthIdentity = {
	user: string;
	role: AuthRole;
};

export type AuthAccount = {
	user: string;
	password: string;
	role: AuthRole;
};

function constantTimeStringEqual(a: string, b: string): boolean {
	const ab = Buffer.from(a, 'utf8');
	const bb = Buffer.from(b, 'utf8');
	if (ab.length !== bb.length) {
		return false;
	}
	return timingSafeEqual(ab, bb);
}

function decodeBasicHeader(
	authorizationHeader: string | undefined,
): { user: string; password: string } | null {
	if (!authorizationHeader?.toLowerCase().startsWith('basic ')) {
		return null;
	}
	let decoded: string;
	try {
		decoded = Buffer.from(
			authorizationHeader.slice(6).trim(),
			'base64',
		).toString('utf8');
	} catch {
		return null;
	}
	const idx = decoded.indexOf(':');
	if (idx === -1) {
		return null;
	}
	return {
		user: decoded.slice(0, idx),
		password: decoded.slice(idx + 1),
	};
}

/**
 * Returns the matching account when credentials match one of the configured
 * accounts, otherwise null. Password comparison is constant-time per account.
 */
export function authenticateBasicAuth(
	authorizationHeader: string | undefined,
	accounts: readonly AuthAccount[],
): AuthIdentity | null {
	const creds = decodeBasicHeader(authorizationHeader);
	if (!creds) {
		return null;
	}
	for (const account of accounts) {
		if (account.user !== creds.user) {
			continue;
		}
		if (constantTimeStringEqual(creds.password, account.password)) {
			return { user: account.user, role: account.role };
		}
	}
	return null;
}
