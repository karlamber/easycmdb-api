import type { LoggerPort } from './logger.port.js';

export type AuditEntity =
	| 'application'
	| 'landscape'
	| 'landscape_environment'
	| 'resource'
	| 'hosting_provider';

export type AuditAction = 'create' | 'update' | 'delete';

export type AuditMutationFields = {
	action: AuditAction;
	entity: AuditEntity;
	entityId: string | number;
	changedFields?: string[];
};

/**
 * Emit a structured audit event for a successful CRUD mutation. Field names
 * only on updates — never log values that may contain PII.
 */
export function logAuditMutation(
	logger: LoggerPort,
	fields: AuditMutationFields,
): void {
	logger.info('audit.mutation', fields);
}
