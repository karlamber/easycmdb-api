import type {
	CreateLandscapeInput,
	Landscape,
	UpdateLandscapeInput,
} from '../domain/landscape.js';
import type { ActorRef } from '../domain/actor.js';
import { NotFoundError } from '../domain/errors.js';
import type { LandscapeRepository } from '../domain/repositories.js';

export class LandscapeCrudService {
	constructor(private readonly repo: LandscapeRepository) {}

	async list(includeInactive: boolean): Promise<Landscape[]> {
		return this.repo.list({ includeInactive });
	}

	async getById(id: string): Promise<Landscape> {
		const row = await this.repo.findById(id);
		if (!row) {
			throw new NotFoundError('landscape', id);
		}
		return row;
	}

	async create(
		input: CreateLandscapeInput,
		actor: ActorRef,
	): Promise<Landscape> {
		return this.repo.create(input, actor);
	}

	async update(
		id: string,
		patch: UpdateLandscapeInput,
		actor: ActorRef,
	): Promise<Landscape> {
		const updated = await this.repo.update(id, patch, actor);
		if (!updated) {
			throw new NotFoundError('landscape', id);
		}
		return updated;
	}

	async softDelete(id: string, actor: ActorRef): Promise<void> {
		const row = await this.repo.findById(id);
		if (!row) {
			throw new NotFoundError('landscape', id);
		}
		if (!row.is_active) {
			return;
		}
		const ok = await this.repo.softDelete(id, actor);
		if (!ok) {
			throw new NotFoundError('landscape', id);
		}
	}
}
