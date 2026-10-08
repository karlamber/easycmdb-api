import { NotFoundError, ValidationError } from '../domain/errors.js';
import type { ActorRef } from '../domain/actor.js';
import type {
	CreateResourceInput,
	Resource,
	ResourceScope,
	UpdateResourceInput,
} from '../domain/resource.js';
import type { ResourceRepository } from '../domain/repositories.js';

function assertResourceScope(
	scope: ResourceScope,
	applicationId: string | null,
): void {
	if (scope === 'APPLICATION' && applicationId == null) {
		throw new ValidationError(
			'application_id is required when resource_scope is APPLICATION',
		);
	}
	if (scope === 'ENVIRONMENT' && applicationId != null) {
		throw new ValidationError(
			'application_id must be null when resource_scope is ENVIRONMENT',
		);
	}
}

export class ResourceCrudService {
	constructor(private readonly repo: ResourceRepository) {}

	async list(
		includeInactive: boolean,
		filters: {
			landscapeId?: string;
			landscapeEnvironmentId?: string;
			applicationId?: string;
		},
	): Promise<Resource[]> {
		return this.repo.list({ includeInactive, ...filters });
	}

	async getById(id: string): Promise<Resource> {
		const row = await this.repo.findById(id);
		if (!row) {
			throw new NotFoundError('resource', id);
		}
		return row;
	}

	async create(
		input: CreateResourceInput,
		actor: ActorRef,
	): Promise<Resource> {
		assertResourceScope(input.resource_scope, input.application_id);
		return this.repo.create(input, actor);
	}

	async update(
		id: string,
		patch: UpdateResourceInput,
		actor: ActorRef,
	): Promise<Resource> {
		const existing = await this.repo.findById(id);
		if (!existing) {
			throw new NotFoundError('resource', id);
		}
		const merged: Resource = { ...existing, ...patch };
		assertResourceScope(merged.resource_scope, merged.application_id);
		const updated = await this.repo.update(id, patch, actor);
		if (!updated) {
			throw new NotFoundError('resource', id);
		}
		return updated;
	}

	async softDelete(id: string, actor: ActorRef): Promise<void> {
		const row = await this.repo.findById(id);
		if (!row) {
			throw new NotFoundError('resource', id);
		}
		if (!row.is_active) {
			return;
		}
		const ok = await this.repo.softDelete(id, actor);
		if (!ok) {
			throw new NotFoundError('resource', id);
		}
	}
}
