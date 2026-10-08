import type { ActorRef } from '../../domain/actor.js';
import type {
	CreateHostingProviderInput,
	HostingProvider,
	UpdateHostingProviderInput,
} from '../../domain/hosting-provider.js';
import type {
	HostingProviderRepository,
	ListFilter,
} from '../../domain/repositories.js';
import { translatePgError } from '../db/pg-errors.js';
import { auditUserFields, idString, iso } from '../db/row-utils.js';
import type { Pool } from 'pg';

const updatableColumns = ['display_name', 'description', 'is_active'] as const;

function mapRow(row: Record<string, unknown>): HostingProvider {
	return {
		id: idString(row.id),
		code: String(row.code),
		display_name: String(row.display_name),
		description: row.description == null ? null : String(row.description),
		is_active: Boolean(row.is_active),
		created_at: iso(row.created_at),
		updated_at: iso(row.updated_at),
		...auditUserFields(row),
	};
}

export class PgHostingProviderRepository implements HostingProviderRepository {
	constructor(private readonly pool: Pool) {}

	async list(filter: ListFilter): Promise<HostingProvider[]> {
		const res = await this.pool.query(
			`SELECT * FROM hosting_provider
       WHERE ($1::boolean OR is_active = true)
       ORDER BY code ASC`,
			[filter.includeInactive],
		);
		return res.rows.map((r) => mapRow(r as Record<string, unknown>));
	}

	async findById(id: string): Promise<HostingProvider | null> {
		const res = await this.pool.query(
			`SELECT * FROM hosting_provider WHERE id = $1`,
			[id],
		);
		const row = res.rows[0];
		return row ? mapRow(row as Record<string, unknown>) : null;
	}

	async findByCode(code: string): Promise<HostingProvider | null> {
		const res = await this.pool.query(
			`SELECT * FROM hosting_provider WHERE code = $1`,
			[code],
		);
		const row = res.rows[0];
		return row ? mapRow(row as Record<string, unknown>) : null;
	}

	async countEnvironmentsUsingCode(code: string): Promise<number> {
		const res = await this.pool.query(
			`SELECT COUNT(*)::int AS cnt
       FROM landscape_environment
       WHERE hosting_provider = $1`,
			[code],
		);
		return Number(res.rows[0]?.cnt ?? 0);
	}

	async create(
		input: CreateHostingProviderInput,
		actor: ActorRef,
	): Promise<HostingProvider> {
		try {
			const res = await this.pool.query(
				`INSERT INTO hosting_provider (
          code, display_name, description, is_active, created_by
        ) VALUES ($1, $2, $3, COALESCE($4, true), $5)
        RETURNING *`,
				[
					input.code,
					input.display_name,
					input.description,
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
		patch: UpdateHostingProviderInput,
		actor: ActorRef,
	): Promise<HostingProvider | null> {
		const sets: string[] = [];
		const values: unknown[] = [];
		let i = 1;
		for (const col of updatableColumns) {
			if (
				col in patch &&
				patch[col as keyof UpdateHostingProviderInput] !== undefined
			) {
				sets.push(`${col} = $${i++}`);
				values.push(patch[col as keyof UpdateHostingProviderInput]);
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
				`UPDATE hosting_provider SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
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
			`UPDATE hosting_provider
       SET is_active = false, deleted_by = $2, updated_by = $2
       WHERE id = $1 AND is_active = true`,
			[id, actor],
		);
		return res.rowCount === 1;
	}
}
