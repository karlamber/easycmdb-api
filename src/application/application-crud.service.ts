import type {
	Application,
	CreateApplicationInput,
	UpdateApplicationInput,
} from '../domain/application.js';
import type { ActorRef } from '../domain/actor.js';
import { NotFoundError } from '../domain/errors.js';
import type { ApplicationRepository } from '../domain/repositories.js';

export class ApplicationCrudService {
	constructor(private readonly repo: ApplicationRepository) {}

	async list(includeInactive: boolean): Promise<Application[]> {
		return this.repo.list({ includeInactive });
	}

	async getById(id: string): Promise<Application> {
		const row = await this.repo.findById(id);
		if (!row) {
			throw new NotFoundError('application', id);
		}
		return row;
	}

	async create(
		input: CreateApplicationInput,
		actor: ActorRef,
	): Promise<Application> {
		return this.repo.create(input, actor);
	}

	async update(
		id: string,
		patch: UpdateApplicationInput,
		actor: ActorRef,
	): Promise<Application> {
		const updated = await this.repo.update(id, patch, actor);
		if (!updated) {
			throw new NotFoundError('application', id);
		}
		return updated;
	}

	async softDelete(id: string, actor: ActorRef): Promise<void> {
		const row = await this.repo.findById(id);
		if (!row) {
			throw new NotFoundError('application', id);
		}
		if (!row.is_active) {
			return;
		}
		const ok = await this.repo.softDelete(id, actor);
		if (!ok) {
			throw new NotFoundError('application', id);
		}
	}
}
