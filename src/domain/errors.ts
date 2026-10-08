export class DomainError extends Error {
	readonly statusCode: number;
	readonly code: string;

	constructor(message: string, statusCode: number, code: string) {
		super(message);
		this.name = 'DomainError';
		this.statusCode = statusCode;
		this.code = code;
	}
}

export class NotFoundError extends DomainError {
	constructor(resource: string, id: string) {
		super(`${resource} not found: ${id}`, 404, 'NOT_FOUND');
		this.name = 'NotFoundError';
	}
}

export class ConflictError extends DomainError {
	constructor(message: string) {
		super(message, 409, 'CONFLICT');
		this.name = 'ConflictError';
	}
}

export class ValidationError extends DomainError {
	constructor(message: string) {
		super(message, 400, 'VALIDATION_ERROR');
		this.name = 'ValidationError';
	}
}

export class UnauthorizedError extends DomainError {
	constructor(message = 'Unauthorized') {
		super(message, 401, 'UNAUTHORIZED');
		this.name = 'UnauthorizedError';
	}
}
