import type {
	CreateLandscapeEnvironmentInput,
	LandscapeEnvironment,
	UpdateLandscapeEnvironmentInput,
} from '../../domain/landscape-environment.js';
import type {
	LandscapeEnvironmentRepository,
	ListFilter,
} from '../../domain/repositories.js';
import { translatePgError } from '../db/pg-errors.js';
import { auditUserFields, idString, iso } from '../db/row-utils.js';
import type { Pool } from 'pg';
import type { ActorRef } from '../../domain/actor.js';

const columns = [
	'landscape_id',
	'environment_name',
	'hosting_provider',
	'provider_account_name',
	'provider_account_number',
	'direct_link',
	'is_active',
] as const;

function mapRow(row: Record<string, unknown>): LandscapeEnvironment {
	return {
		id: idString(row.id),
		landscape_id: idString(row.landscape_id),
		environment_name: String(row.environment_name),
		hosting_provider: String(
			row.hosting_provider,
		) as LandscapeEnvironment['hosting_provider'],
		provider_account_name:
			row.provider_account_name == null
				? null
				: String(row.provider_account_name),
		provider_account_number:
			row.provider_account_number == null
				? null
				: String(row.provider_account_number),
		direct_link: row.direct_link == null ? null : String(row.direct_link),
		is_active: Boolean(row.is_active),
		created_at: iso(row.created_at),
		updated_at: iso(row.updated_at),
		...auditUserFields(row),
	};
}

export class PgLandscapeEnvironmentRepository implements LandscapeEnvironmentRepository {
	constructor(private readonly pool: Pool) {}

	async list(
		filter: ListFilter & { landscapeId?: string },
	): Promise<LandscapeEnvironment[]> {
		if (filter.landscapeId) {
			const res = await this.pool.query(
				`SELECT * FROM landscape_environment
         WHERE landscape_id = $2
           AND ($1::boolean OR is_active = true)
         ORDER BY id ASC`,
				[filter.includeInactive, filter.landscapeId],
			);
			return res.rows.map((r) => mapRow(r as Record<string, unknown>));
		}
		const res = await this.pool.query(
			`SELECT * FROM landscape_environment
       WHERE ($1::boolean OR is_active = true)
       ORDER BY id ASC`,
			[filter.includeInactive],
		);
		return res.rows.map((r) => mapRow(r as Record<string, unknown>));
	}

	async findById(id: string): Promise<LandscapeEnvironment | null> {
		const res = await this.pool.query(
			`SELECT * FROM landscape_environment WHERE id = $1`,
			[id],
		);
		const row = res.rows[0];
		return row ? mapRow(row as Record<string, unknown>) : null;
	}

	async create(
		input: CreateLandscapeEnvironmentInput,
		actor: ActorRef,
	): Promise<LandscapeEnvironment> {
		try {
			const res = await this.pool.query(
				`INSERT INTO landscape_environment (
          landscape_id, environment_name, hosting_provider,
          provider_account_name, provider_account_number, direct_link,
          is_active, created_by
        ) VALUES ($1,$2,$3,$4,$5,$6, COALESCE($7, true), $8)
        RETURNING *`,
				[
					input.landscape_id,
					input.environment_name,
					input.hosting_provider,
					input.provider_account_name,
					input.provider_account_number,
					input.direct_link,
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
		patch: UpdateLandscapeEnvironmentInput,
		actor: ActorRef,
	): Promise<LandscapeEnvironment | null> {
		const sets: string[] = [];
		const values: unknown[] = [];
		let i = 1;
		for (const col of columns) {
			if (
				col in patch &&
				patch[col as keyof UpdateLandscapeEnvironmentInput] !==
					undefined
			) {
				sets.push(`${col} = $${i++}`);
				values.push(
					patch[col as keyof UpdateLandscapeEnvironmentInput],
				);
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
				`UPDATE landscape_environment SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
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
			`UPDATE landscape_environment
       SET is_active = false, deleted_by = $2, updated_by = $2
       WHERE id = $1 AND is_active = true`,
			[id, actor],
		);
		return res.rowCount === 1;
	}
}
