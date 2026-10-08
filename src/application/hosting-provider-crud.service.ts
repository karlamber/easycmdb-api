import type { ActorRef } from '../domain/actor.js';
import {
	ConflictError,
	NotFoundError,
	ValidationError,
} from '../domain/errors.js';
import type {
	CreateHostingProviderInput,
	HostingProvider,
	UpdateHostingProviderInput,
} from '../domain/hosting-provider.js';
import type { HostingProviderRepository } from '../domain/repositories.js';

export class HostingProviderCrudService {
	constructor(private readonly repo: HostingProviderRepository) {}

	async list(includeInactive: boolean): Promise<HostingProvider[]> {
		return this.repo.list({ includeInactive });
	}

	async getById(id: string): Promise<HostingProvider> {
		const row = await this.repo.findById(id);
		if (!row) {
			throw new NotFoundError('hosting_provider', id);
		}
		return row;
	}

	async create(
		input: CreateHostingProviderInput,
		actor: ActorRef,
	): Promise<HostingProvider> {
		return this.repo.create(input, actor);
	}

	async update(
		id: string,
		patch: UpdateHostingProviderInput,
		actor: ActorRef,
	): Promise<HostingProvider> {
		const updated = await this.repo.update(id, patch, actor);
		if (!updated) {
			throw new NotFoundError('hosting_provider', id);
		}
		return updated;
	}

	async softDelete(id: string, actor: ActorRef): Promise<void> {
		const row = await this.repo.findById(id);
		if (!row) {
			throw new NotFoundError('hosting_provider', id);
		}
		if (!row.is_active) {
			return;
		}
		const usage = await this.repo.countEnvironmentsUsingCode(row.code);
		if (usage > 0) {
			throw new ConflictError(
				`Cannot deactivate hosting provider "${row.code}": ${usage} landscape environment(s) still reference it. Reassign those environments first.`,
			);
		}
		const ok = await this.repo.softDelete(id, actor);
		if (!ok) {
			throw new NotFoundError('hosting_provider', id);
		}
	}

	/** Ensures code exists and is active before attaching to an environment. */
	async requireActiveCode(code: string): Promise<HostingProvider> {
		const row = await this.repo.findByCode(code);
		if (!row || !row.is_active) {
			throw new ValidationError(
				`Unknown or inactive hosting provider code: ${code}`,
			);
		}
		return row;
	}
}
