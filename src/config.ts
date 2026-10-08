import { z } from 'zod';

/**
 * AUTH_MODE controls which authentication strategies the API accepts.
 *
 *   basic   - Legacy HTTP Basic auth only. Credentials come from BASIC_AUTH_*.
 *   cognito - Cognito JWT only. Identity is read from JWT claims forwarded by
 *             the API Gateway HTTP API JWT authorizer.
 *   both    - Accept either. Prefer JWT claims when present (i.e. when the
 *             request hits a route with the authorizer attached); otherwise
 *             fall back to Basic. Used during the phased rollout so existing
 *             basic-auth clients keep working while new clients onboard to
 *             Cognito.
 *
 * Default is `basic` so that misconfigured environments cannot accidentally
 * accept Cognito tokens without explicit opt-in.
 */
export const authModeSchema = z.enum(['basic', 'cognito', 'both']);
export type AuthMode = z.infer<typeof authModeSchema>;

const envSchema = z
	.object({
		PGHOST: z.string().min(1),
		PGPORT: z.coerce.number().default(5432),
		PGUSER: z.string().min(1),
		PGPASSWORD: z.string().min(1),
		PGDATABASE: z.string().min(1),
		PG_SSL: z
			.enum(['true', 'false'])
			.optional()
			.transform((v) => v === 'true'),
		// When PG_SSL=true, set to "false" to skip TLS cert verification (e.g. for
		// Aurora clusters using the legacy rds-ca-2019 CA). Connection stays TLS-encrypted.
		PG_SSL_REJECT_UNAUTHORIZED: z
			.enum(['true', 'false'])
			.optional()
			.default('true')
			.transform((v) => v === 'true'),

		// Auth strategy selector. See JSDoc above.
		AUTH_MODE: authModeSchema.optional().default('basic'),

		// Basic auth credentials. Required when AUTH_MODE includes basic.
		// BASIC_AUTH_USER/PASSWORD grants the "viewer" role (read-only).
		// BASIC_AUTH_ADMIN_USER/PASSWORD grants the "admin" role (write access).
		BASIC_AUTH_USER: z.string().min(1).optional(),
		BASIC_AUTH_PASSWORD: z.string().min(1).optional(),
		BASIC_AUTH_ADMIN_USER: z.string().min(1).optional(),
		BASIC_AUTH_ADMIN_PASSWORD: z.string().min(1).optional(),

		// Cognito JWT settings. Required when AUTH_MODE includes cognito.
		// The Lambda itself does NOT validate the JWT signature - that is the
		// API Gateway HTTP API JWT authorizer's job. We only use COGNITO_ISSUER
		// and COGNITO_APP_CLIENT_ID for diagnostics (e.g. to log a clear error
		// if claims arrive from an unexpected issuer/audience).
		COGNITO_USER_POOL_ID: z.string().min(1).optional(),
		COGNITO_APP_CLIENT_ID: z.string().min(1).optional(),
		COGNITO_ISSUER: z.string().url().optional(),

		// Mapping from claim values to internal roles. The Lambda treats any
		// authenticated user whose `custom:roles` claim (or `cognito:groups`)
		// contains ADMIN_ROLE_CLAIM_VALUE as an admin, APP_EDIT_ROLE_CLAIM_VALUE
		// as an app_editor (can only write to /applications*), and everyone
		// else who passes authentication as a viewer. Admin takes precedence
		// when both tokens are present. Keeping these configurable lets infra
		// rename the Entra app roles without a Lambda redeploy.
		ADMIN_ROLE_CLAIM_VALUE: z.string().min(1).default('argus-admin'),
		APP_EDIT_ROLE_CLAIM_VALUE: z.string().min(1).default('argus-app-edit'),
		VIEWER_ROLE_CLAIM_VALUE: z.string().min(1).default('argus-viewer'),

		CORS_ORIGIN: z.string().optional(),
		LOG_LEVEL: z
			.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
			.optional()
			.default('info'),
		SERVICE_NAME: z.string().min(1).optional().default('easycmdb-api'),
		ENV_NAME: z.string().min(1).optional().default('local'),
	})
	.superRefine((cfg, ctx) => {
		const usesBasic = cfg.AUTH_MODE === 'basic' || cfg.AUTH_MODE === 'both';
		const usesCognito =
			cfg.AUTH_MODE === 'cognito' || cfg.AUTH_MODE === 'both';

		if (usesBasic) {
			if (!cfg.BASIC_AUTH_USER) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['BASIC_AUTH_USER'],
					message: `Required when AUTH_MODE=${cfg.AUTH_MODE}`,
				});
			}
			if (!cfg.BASIC_AUTH_PASSWORD) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['BASIC_AUTH_PASSWORD'],
					message: `Required when AUTH_MODE=${cfg.AUTH_MODE}`,
				});
			}
		}
		if (usesCognito) {
			if (!cfg.COGNITO_APP_CLIENT_ID) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['COGNITO_APP_CLIENT_ID'],
					message: `Required when AUTH_MODE=${cfg.AUTH_MODE}`,
				});
			}
		}
	});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(): AppConfig {
	const parsed = envSchema.safeParse(process.env);
	if (!parsed.success) {
		const msg = parsed.error.flatten().fieldErrors;
		throw new Error(`Invalid environment: ${JSON.stringify(msg)}`);
	}
	return parsed.data;
}
