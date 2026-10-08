import { describe, expect, it } from 'vitest';

import { identityFromJwtClaims } from '../jwt-auth.js';

const mapping = {
	adminClaimValue: 'argus-admin',
	appEditorClaimValue: 'argus-app-edit',
	viewerClaimValue: 'argus-viewer',
};

describe('identityFromJwtClaims', () => {
	it('returns null for null/undefined claims', () => {
		expect(identityFromJwtClaims(null, mapping)).toBeNull();
		expect(identityFromJwtClaims(undefined, mapping)).toBeNull();
	});

	it('returns null when no user identifier claim is present', () => {
		expect(
			identityFromJwtClaims({ 'custom:roles': 'argus-admin' }, mapping),
		).toBeNull();
	});

	it('uses email as the user identifier when present', () => {
		expect(
			identityFromJwtClaims(
				{ email: 'jane@example.com', sub: 'abc' },
				mapping,
			),
		).toEqual({ user: 'jane@example.com', role: 'viewer' });
	});

	it('falls back to cognito:username, then username, then sub', () => {
		expect(
			identityFromJwtClaims(
				{ 'cognito:username': 'jane.user', sub: 'abc' },
				mapping,
			),
		).toEqual({ user: 'jane.user', role: 'viewer' });

		expect(
			identityFromJwtClaims({ username: 'classic', sub: 'abc' }, mapping),
		).toEqual({ user: 'classic', role: 'viewer' });

		expect(identityFromJwtClaims({ sub: 'opaque-id' }, mapping)).toEqual({
			user: 'opaque-id',
			role: 'viewer',
		});
	});

	it('promotes to admin when custom:roles contains the admin value', () => {
		expect(
			identityFromJwtClaims(
				{
					email: 'jane@example.com',
					'custom:roles': 'argus-admin',
				},
				mapping,
			),
		).toEqual({ user: 'jane@example.com', role: 'admin' });
	});

	it('parses comma- and space-separated role strings', () => {
		expect(
			identityFromJwtClaims(
				{
					email: 'j@x',
					'custom:roles': 'analyst argus-admin engineer',
				},
				mapping,
			),
		).toEqual({ user: 'j@x', role: 'admin' });

		expect(
			identityFromJwtClaims(
				{ email: 'j@x', 'custom:roles': 'analyst,argus-admin' },
				mapping,
			),
		).toEqual({ user: 'j@x', role: 'admin' });
	});

	it('parses bracketed-array role strings (cognito:groups quirk)', () => {
		expect(
			identityFromJwtClaims(
				{
					email: 'j@x',
					'cognito:groups': '[viewer,argus-admin]',
				},
				mapping,
			),
		).toEqual({ user: 'j@x', role: 'admin' });
	});

	it('respects array claims', () => {
		expect(
			identityFromJwtClaims(
				{
					email: 'j@x',
					'cognito:groups': ['viewer', 'argus-admin'],
				},
				mapping,
			),
		).toEqual({ user: 'j@x', role: 'admin' });
	});

	it('defaults to viewer when no role tokens match the admin value', () => {
		expect(
			identityFromJwtClaims(
				{ email: 'j@x', 'custom:roles': 'random-role' },
				mapping,
			),
		).toEqual({ user: 'j@x', role: 'viewer' });
	});

	it('promotes to app_editor when only the app-editor token is present', () => {
		expect(
			identityFromJwtClaims(
				{
					email: 'app-owner@example.com',
					'custom:roles': 'argus-app-edit',
				},
				mapping,
			),
		).toEqual({ user: 'app-owner@example.com', role: 'app_editor' });
	});

	it('prefers admin over app_editor when both tokens are present', () => {
		// Defensive: during a role migration a user may temporarily hold both
		// claims. Admin must win so they do not accidentally lose access.
		expect(
			identityFromJwtClaims(
				{
					email: 'jane@example.com',
					'custom:roles': 'argus-app-edit argus-admin',
				},
				mapping,
			),
		).toEqual({ user: 'jane@example.com', role: 'admin' });
	});

	it('app_editor match is case-sensitive', () => {
		expect(
			identityFromJwtClaims(
				{ email: 'j@x', 'custom:roles': 'ARGUS-APP-EDIT' },
				mapping,
			),
		).toEqual({ user: 'j@x', role: 'viewer' });
	});

	it('admin match is case-sensitive (defensive: avoids accidental escalation)', () => {
		expect(
			identityFromJwtClaims(
				{ email: 'j@x', 'custom:roles': 'ARGUS-ADMIN' },
				mapping,
			),
		).toEqual({ user: 'j@x', role: 'viewer' });
	});

	it('ignores non-string claim values', () => {
		expect(
			identityFromJwtClaims(
				{
					email: 42 as unknown as string,
					sub: 'abc',
				},
				mapping,
			),
		).toEqual({ user: 'abc', role: 'viewer' });
	});
});
