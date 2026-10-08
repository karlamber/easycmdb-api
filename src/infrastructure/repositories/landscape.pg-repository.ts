import type {
	CreateLandscapeInput,
	Landscape,
	UpdateLandscapeInput,
} from '../../domain/landscape.js';
import type {
	LandscapeRepository,
	ListFilter,
} from '../../domain/repositories.js';
import { translatePgError } from '../db/pg-errors.js';
import { auditUserFields, idString, iso } from '../db/row-utils.js';
import type { Pool } from 'pg';
import type { ActorRef } from '../../domain/actor.js';

const columns = [
	'name',
	'description',
	'organization',
	'devops_contact',
	'data_class',
	'runbook_url',
	'iac_repository',
	'is_active',
] as const;

function mapRow(row: Record<string, unknown>): Landscape {
	return {
		id: idString(row.id),
		name: String(row.name),
		description: row.description == null ? null : String(row.description),
		organization:
			row.organization == null ? null : String(row.organization),
		devops_contact:
			row.devops_contact == null ? null : String(row.devops_contact),
		data_class:
			row.data_class == null
				? null
				: (String(row.data_class) as Landscape['data_class']),
		runbook_url: row.runbook_url == null ? null : String(row.runbook_url),
		iac_repository:
			row.iac_repository == null ? null : String(row.iac_repository),
		is_active: Boolean(row.is_active),
		created_at: iso(row.created_at),
		updated_at: iso(row.updated_at),
		...auditUserFields(row),
	};
}

export class PgLandscapeRepository implements LandscapeRepository {
	constructor(private readonly pool: Pool) {}

	async list(filter: ListFilter): Promise<Landscape[]> {
		const res = await this.pool.query(
			`SELECT * FROM landscape
       WHERE ($1::boolean OR is_active = true)
       ORDER BY id ASC`,
			[filter.includeInactive],
		);
		return res.rows.map((r) => mapRow(r as Record<string, unknown>));
	}

	async findById(id: string): Promise<Landscape | null> {
		const res = await this.pool.query(
			`SELECT * FROM landscape WHERE id = $1`,
			[id],
		);
		const row = res.rows[0];
		return row ? mapRow(row as Record<string, unknown>) : null;
	}

	async create(
		input: CreateLandscapeInput,
		actor: ActorRef,
	): Promise<Landscape> {
		try {
			const res = await this.pool.query(
				`INSERT INTO landscape (
          name, description, organization, devops_contact,
          data_class, runbook_url, iac_repository, is_active, created_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7, COALESCE($8, true), $9)
        RETURNING *`,
				[
					input.name,
					input.description,
					input.organization,
					input.devops_contact,
					input.data_class,
					input.runbook_url,
					input.iac_repository,
					input.is_active ?? true,
					actor,
				],
			);
			return mapRow(res.rows[0] as Record<string, unknown>);
		} catch (e) {
			throw translatePgError(e);
		}
	}

	async update(
		id: string,
		patch: UpdateLandscapeInput,
		actor: ActorRef,
	): Promise<Landscape | null> {
		const sets: string[] = [];
		const values: unknown[] = [];
		let i = 1;
		for (const col of columns) {
			if (
				col in patch &&
				patch[col as keyof UpdateLandscapeInput] !== undefined
			) {
				sets.push(`${col} = $${i++}`);
				values.push(patch[col as keyof UpdateLandscapeInput]);
			}
		}
		if (sets.length === 0) {
			return this.findById(id);
		}
		sets.push(`updated_by = $${i++}`);
		values.push(actor);
		values.push(id);
		try {
			const res = await this.pool.query(
				`UPDATE landscape SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
				values,
			);
			const row = res.rows[0];
			return row ? mapRow(row as Record<string, unknown>) : null;
		} catch (e) {
			throw translatePgError(e);
		}
	}

	async softDelete(id: string, actor: ActorRef): Promise<boolean> {
		const res = await this.pool.query(
			`UPDATE landscape
       SET is_active = false, deleted_by = $2, updated_by = $2
       WHERE id = $1 AND is_active = true`,
			[id, actor],
		);
		return res.rowCount === 1;
	}
}
