import type { HostingProviderCrudService } from './hosting-provider-crud.service.js';
import type {
	CreateLandscapeEnvironmentInput,
	LandscapeEnvironment,
	UpdateLandscapeEnvironmentInput,
} from '../domain/landscape-environment.js';
import type { ActorRef } from '../domain/actor.js';
import { NotFoundError } from '../domain/errors.js';
import type { LandscapeEnvironmentRepository } from '../domain/repositories.js';

export class LandscapeEnvironmentCrudService {
	constructor(
		private readonly repo: LandscapeEnvironmentRepository,
		private readonly hostingProviders: HostingProviderCrudService,
	) {}

	async list(
		includeInactive: boolean,
		landscapeId?: string,
	): Promise<LandscapeEnvironment[]> {
		return this.repo.list({ includeInactive, landscapeId });
	}

	async getById(id: string): Promise<LandscapeEnvironment> {
		const row = await this.repo.findById(id);
		if (!row) {
			throw new NotFoundError('landscape_environment', id);
		}
		return row;
	}

	async create(
		input: CreateLandscapeEnvironmentInput,
		actor: ActorRef,
	): Promise<LandscapeEnvironment> {
		await this.hostingProviders.requireActiveCode(input.hosting_provider);
		return this.repo.create(input, actor);
	}

	async update(
		id: string,
		patch: UpdateLandscapeEnvironmentInput,
		actor: ActorRef,
	): Promise<LandscapeEnvironment> {
		if (patch.hosting_provider !== undefined) {
			await this.hostingProviders.requireActiveCode(
				patch.hosting_provider,
			);
		}
		const updated = await this.repo.update(id, patch, actor);
		if (!updated) {
			throw new NotFoundError('landscape_environment', id);
		}
		return updated;
	}

	async softDelete(id: string, actor: ActorRef): Promise<void> {
		const row = await this.repo.findById(id);
		if (!row) {
			throw new NotFoundError('landscape_environment', id);
		}
		if (!row.is_active) {
			return;
		}
		const ok = await this.repo.softDelete(id, actor);
		if (!ok) {
			throw new NotFoundError('landscape_environment', id);
		}
	}
}
