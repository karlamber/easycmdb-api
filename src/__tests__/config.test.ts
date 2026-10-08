import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../config.js';

const baseEnv: Record<string, string> = {
	PGHOST: 'localhost',
	PGUSER: 'u',
	PGPASSWORD: 'p',
	PGDATABASE: 'd',
};

let savedEnv: NodeJS.ProcessEnv;

beforeEach(() => {
	savedEnv = process.env;
	process.env = { ...baseEnv } as NodeJS.ProcessEnv;
});

afterEach(() => {
	process.env = savedEnv;
});

describe('loadConfig', () => {
	it('defaults AUTH_MODE to basic and requires basic-auth credentials', () => {
		expect(() => loadConfig()).toThrow(/BASIC_AUTH_USER/);
	});

	it('accepts AUTH_MODE=basic with credentials supplied', () => {
		Object.assign(process.env, {
			AUTH_MODE: 'basic',
			BASIC_AUTH_USER: 'u',
			BASIC_AUTH_PASSWORD: 'p',
		});
		const cfg = loadConfig();
		expect(cfg.AUTH_MODE).toBe('basic');
		expect(cfg.ADMIN_ROLE_CLAIM_VALUE).toBe('argus-admin');
		expect(cfg.APP_EDIT_ROLE_CLAIM_VALUE).toBe('argus-app-edit');
		expect(cfg.VIEWER_ROLE_CLAIM_VALUE).toBe('argus-viewer');
	});

	it('requires COGNITO_APP_CLIENT_ID when AUTH_MODE=cognito', () => {
		Object.assign(process.env, { AUTH_MODE: 'cognito' });
		expect(() => loadConfig()).toThrow(/COGNITO_APP_CLIENT_ID/);
	});

	it('accepts AUTH_MODE=cognito with Cognito values supplied', () => {
		Object.assign(process.env, {
			AUTH_MODE: 'cognito',
			COGNITO_APP_CLIENT_ID: 'cid',
		});
		const cfg = loadConfig();
		expect(cfg.AUTH_MODE).toBe('cognito');
		expect(cfg.BASIC_AUTH_USER).toBeUndefined();
	});

	it('requires both Basic and Cognito values when AUTH_MODE=both', () => {
		Object.assign(process.env, {
			AUTH_MODE: 'both',
			BASIC_AUTH_USER: 'u',
			BASIC_AUTH_PASSWORD: 'p',
			COGNITO_APP_CLIENT_ID: 'cid',
		});
		const cfg = loadConfig();
		expect(cfg.AUTH_MODE).toBe('both');
		expect(cfg.BASIC_AUTH_USER).toBe('u');
		expect(cfg.COGNITO_APP_CLIENT_ID).toBe('cid');
	});

	it('allows overriding role-claim values for renaming Entra app roles', () => {
		Object.assign(process.env, {
			AUTH_MODE: 'basic',
			BASIC_AUTH_USER: 'u',
			BASIC_AUTH_PASSWORD: 'p',
			ADMIN_ROLE_CLAIM_VALUE: 'argus-superuser',
			APP_EDIT_ROLE_CLAIM_VALUE: 'argus-application-owner',
			VIEWER_ROLE_CLAIM_VALUE: 'argus-readonly',
		});
		const cfg = loadConfig();
		expect(cfg.ADMIN_ROLE_CLAIM_VALUE).toBe('argus-superuser');
		expect(cfg.APP_EDIT_ROLE_CLAIM_VALUE).toBe('argus-application-owner');
		expect(cfg.VIEWER_ROLE_CLAIM_VALUE).toBe('argus-readonly');
	});
});
