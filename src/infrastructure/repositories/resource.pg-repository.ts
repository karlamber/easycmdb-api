import type {
	CreateResourceInput,
	Resource,
	UpdateResourceInput,
} from '../../domain/resource.js';
import type {
	ListFilter,
	ResourceRepository,
} from '../../domain/repositories.js';
import { translatePgError } from '../db/pg-errors.js';
import { auditUserFields, idString, iso } from '../db/row-utils.js';
import type { Pool } from 'pg';
import type { ActorRef } from '../../domain/actor.js';

const columns = [
	'landscape_id',
	'landscape_environment_id',
	'application_id',
	'resource_scope',
	'name',
	'description',
	'region',
	'service',
	'resource_type',
	'provider_resource_id',
	'is_active',
] as const;

function mapRow(row: Record<string, unknown>): Resource {
	return {
		id: idString(row.id),
		landscape_id: idString(row.landscape_id),
		landscape_environment_id: idString(row.landscape_environment_id),
		application_id:
			row.application_id == null ? null : idString(row.application_id),
		resource_scope: String(
			row.resource_scope,
		) as Resource['resource_scope'],
		name: String(row.name),
		description: row.description == null ? null : String(row.description),
		region: row.region == null ? null : String(row.region),
		service: row.service == null ? null : String(row.service),
		resource_type:
			row.resource_type == null ? null : String(row.resource_type),
		provider_resource_id:
			row.provider_resource_id == null
				? null
				: String(row.provider_resource_id),
		is_active: Boolean(row.is_active),
		created_at: iso(row.created_at),
		updated_at: iso(row.updated_at),
		...auditUserFields(row),
	};
}

export class PgResourceRepository implements ResourceRepository {
	constructor(private readonly pool: Pool) {}

	async list(
		filter: ListFilter & {
			landscapeId?: string;
			landscapeEnvironmentId?: string;
			applicationId?: string;
		},
	): Promise<Resource[]> {
		const clauses: string[] = ['($1::boolean OR is_active = true)'];
		const params: unknown[] = [filter.includeInactive];
		let p = 2;

		if (filter.landscapeId) {
			clauses.push(`landscape_id = $${p++}`);
			params.push(filter.landscapeId);
		}
		if (filter.landscapeEnvironmentId) {
			clauses.push(`landscape_environment_id = $${p++}`);
			params.push(filter.landscapeEnvironmentId);
		}
		if (filter.applicationId) {
			clauses.push(`application_id = $${p++}`);
			params.push(filter.applicationId);
		}

		const res = await this.pool.query(
			`SELECT * FROM resource WHERE ${clauses.join(' AND ')} ORDER BY id ASC`,
			params,
		);
		return res.rows.map((r) => mapRow(r as Record<string, unknown>));
	}

	async findById(id: string): Promise<Resource | null> {
		const res = await this.pool.query(
			`SELECT * FROM resource WHERE id = $1`,
			[id],
		);
		const row = res.rows[0];
		return row ? mapRow(row as Record<string, unknown>) : null;
	}

	async create(
		input: CreateResourceInput,
		actor: ActorRef,
	): Promise<Resource> {
		try {
			const res = await this.pool.query(
				`INSERT INTO resource (
          landscape_id, landscape_environment_id, application_id,
          resource_scope, name, description, region, service,
          resource_type, provider_resource_id, is_active, created_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, COALESCE($11, true), $12)
        RETURNING *`,
				[
					input.landscape_id,
					input.landscape_environment_id,
					input.application_id,
					input.resource_scope,
					input.name,
					input.description,
					input.region,
					input.service,
					input.resource_type,
					input.provider_resource_id,
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
		patch: UpdateResourceInput,
		actor: ActorRef,
	): Promise<Resource | null> {
		const sets: string[] = [];
		const values: unknown[] = [];
		let i = 1;
		for (const col of columns) {
			if (
				col in patch &&
				patch[col as keyof UpdateResourceInput] !== undefined
			) {
				sets.push(`${col} = $${i++}`);
				values.push(patch[col as keyof UpdateResourceInput]);
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
				`UPDATE resource SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
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
			`UPDATE resource
       SET is_active = false, deleted_by = $2, updated_by = $2
       WHERE id = $1 AND is_active = true`,
			[id, actor],
		);
		return res.rowCount === 1;
	}
}
