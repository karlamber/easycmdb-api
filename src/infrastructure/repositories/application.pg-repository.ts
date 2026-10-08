import type {
	Application,
	CreateApplicationInput,
	UpdateApplicationInput,
} from '../../domain/application.js';
import { coerceComplianceTags } from '../../domain/compliance.js';
import type {
	ApplicationRepository,
	ListFilter,
} from '../../domain/repositories.js';
import type { ActorRef } from '../../domain/actor.js';
import { translatePgError } from '../db/pg-errors.js';
import { auditUserFields, idString, iso } from '../db/row-utils.js';
import type { Pool } from 'pg';

const columns = [
	'app_alias',
	'business_name',
	'description',
	'data_class',
	'compliance',
	'business_contact',
	'development_contact',
	'support_contact',
	'source_repository',
	'prod_url',
	'runbook_url',
	'is_active',
] as const;

function mapRow(row: Record<string, unknown>): Application {
	return {
		id: idString(row.id),
		app_alias: String(row.app_alias),
		business_name:
			row.business_name == null ? null : String(row.business_name),
		description: row.description == null ? null : String(row.description),
		data_class:
			row.data_class == null
				? null
				: (String(row.data_class) as Application['data_class']),
		compliance: coerceComplianceTags(row.compliance),
		business_contact:
			row.business_contact == null ? null : String(row.business_contact),
		development_contact:
			row.development_contact == null
				? null
				: String(row.development_contact),
		support_contact:
			row.support_contact == null ? null : String(row.support_contact),
		source_repository:
			row.source_repository == null
				? null
				: String(row.source_repository),
		prod_url: row.prod_url == null ? null : String(row.prod_url),
		runbook_url: row.runbook_url == null ? null : String(row.runbook_url),
		is_active: Boolean(row.is_active),
		created_at: iso(row.created_at),
		updated_at: iso(row.updated_at),
		...auditUserFields(row),
	};
}

export class PgApplicationRepository implements ApplicationRepository {
	constructor(private readonly pool: Pool) {}

	async list(filter: ListFilter): Promise<Application[]> {
		const res = await this.pool.query(
			`SELECT * FROM application
       WHERE ($1::boolean OR is_active = true)
       ORDER BY id ASC`,
			[filter.includeInactive],
		);
		return res.rows.map((r) => mapRow(r as Record<string, unknown>));
	}

	async findById(id: string): Promise<Application | null> {
		const res = await this.pool.query(
			`SELECT * FROM application WHERE id = $1`,
			[id],
		);
		const row = res.rows[0];
		return row ? mapRow(row as Record<string, unknown>) : null;
	}

	async create(
		input: CreateApplicationInput,
		actor: ActorRef,
	): Promise<Application> {
		try {
			const res = await this.pool.query(
				`INSERT INTO application (
          app_alias, business_name, description, data_class, compliance,
          business_contact, development_contact, support_contact,
          source_repository, prod_url, runbook_url, is_active, created_by
        ) VALUES ($1,$2,$3,$4,COALESCE($5, '{}'::text[]),
                  $6,$7,$8,$9,$10,$11, COALESCE($12, true), $13)
        RETURNING *`,
				[
					input.app_alias,
					input.business_name,
					input.description,
					input.data_class,
					input.compliance ?? [],
					input.business_contact,
					input.development_contact,
					input.support_contact,
					input.source_repository,
					input.prod_url,
					input.runbook_url,
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
		patch: UpdateApplicationInput,
		actor: ActorRef,
	): Promise<Application | null> {
		const sets: string[] = [];
		const values: unknown[] = [];
		let i = 1;
		for (const col of columns) {
			if (
				col in patch &&
				patch[col as keyof UpdateApplicationInput] !== undefined
			) {
				sets.push(`${col} = $${i++}`);
				values.push(patch[col as keyof UpdateApplicationInput]);
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
				`UPDATE application SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
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
			`UPDATE application
       SET is_active = false, deleted_by = $2, updated_by = $2
       WHERE id = $1 AND is_active = true`,
			[id, actor],
		);
		return res.rowCount === 1;
	}
}
