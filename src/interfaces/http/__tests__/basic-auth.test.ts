import { describe, expect, it } from 'vitest';

import { authenticateBasicAuth } from '../basic-auth.js';

const viewerAccount = {
	user: 'viewer',
	password: 'viewer-pw',
	role: 'viewer',
} as const;

const adminAccount = {
	user: 'admin',
	password: 'admin-pw',
	role: 'admin',
} as const;

function basic(user: string, password: string): string {
	return `Basic ${Buffer.from(`${user}:${password}`, 'utf8').toString('base64')}`;
}

describe('authenticateBasicAuth', () => {
	it('returns null when the header is missing', () => {
		expect(authenticateBasicAuth(undefined, [viewerAccount])).toBeNull();
	});

	it('returns null when the scheme is not Basic', () => {
		expect(authenticateBasicAuth('Bearer abc', [viewerAccount])).toBeNull();
	});

	it('returns null when the encoded payload is malformed', () => {
		expect(
			authenticateBasicAuth('Basic not-base64!!!', [viewerAccount]),
		).toBeNull();
	});

	it('matches the viewer account and returns the viewer role', () => {
		const id = authenticateBasicAuth(basic('viewer', 'viewer-pw'), [
			viewerAccount,
			adminAccount,
		]);
		expect(id).toEqual({ user: 'viewer', role: 'viewer' });
	});

	it('matches the admin account and returns the admin role', () => {
		const id = authenticateBasicAuth(basic('admin', 'admin-pw'), [
			viewerAccount,
			adminAccount,
		]);
		expect(id).toEqual({ user: 'admin', role: 'admin' });
	});

	it('rejects a wrong password even for a known user', () => {
		expect(
			authenticateBasicAuth(basic('admin', 'nope'), [
				viewerAccount,
				adminAccount,
			]),
		).toBeNull();
	});

	it('rejects an unknown user', () => {
		expect(
			authenticateBasicAuth(basic('ghost', 'viewer-pw'), [viewerAccount]),
		).toBeNull();
	});
});
