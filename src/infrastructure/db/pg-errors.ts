import { ConflictError, ValidationError } from '../../domain/errors.js';
import type { DatabaseError } from 'pg';

export function translatePgError(err: unknown): Error {
	if (!isDatabaseError(err)) {
		return err instanceof Error ? err : new Error(String(err));
	}

	switch (err.code) {
		case '23505':
			return new ConflictError('Unique constraint violation.');
		case '23503':
			return new ValidationError(
				'Related record missing or delete blocked by foreign key.',
			);
		case '23514':
			return new ValidationError(
				err.detail ?? 'Check constraint violation.',
			);
		default:
			return err;
	}
}

function isDatabaseError(err: unknown): err is DatabaseError {
	return typeof err === 'object' && err !== null && 'code' in err;
}
