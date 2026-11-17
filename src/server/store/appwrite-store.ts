import type { Client } from "node-appwrite";
import { ID, type Models, Query, TablesDB } from "node-appwrite";
import {
	type BaseRecord,
	type DataStore,
	type Filter,
	JSON_COLUMNS,
	type ListOptions,
	type NewRecord,
	type Table,
	type TableMap,
	type TableName,
} from "./types";

const SYSTEM_KEYS = new Set(["id", "createdAt", "updatedAt"]);

class AppwriteTable<T extends BaseRecord> implements Table<T> {
	constructor(
		private db: TablesDB,
		private databaseId: string,
		private tableId: TableName,
	) {}

	private jsonCols(): Set<string> {
		return new Set((JSON_COLUMNS[this.tableId] ?? []) as string[]);
	}

	private toRow(data: Record<string, unknown>): Record<string, unknown> {
		const json = this.jsonCols();
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(data)) {
			if (SYSTEM_KEYS.has(k) || v === undefined) continue;
			out[k] = json.has(k) ? JSON.stringify(v) : v;
		}
		return out;
	}

	private fromRow(row: Models.Row): T {
		const json = this.jsonCols();
		const out: Record<string, unknown> = {
			id: row.$id,
			createdAt: row.$createdAt,
			updatedAt: row.$updatedAt,
		};
		for (const [k, v] of Object.entries(row)) {
			if (k.startsWith("$")) continue;
			out[k] = json.has(k) && typeof v === "string" ? JSON.parse(v) : v;
		}
		return out as T;
	}

	async get(id: string) {
		try {
			const row = await this.db.getRow({ databaseId: this.databaseId, tableId: this.tableId, rowId: id });
			return this.fromRow(row);
		} catch (e) {
			if ((e as { code?: number }).code === 404) return null;
			throw e;
		}
	}

	async list(filter: Filter<T>, opts: ListOptions = {}) {
		const queries = Object.entries(filter).map(([k, v]) =>
			v === null ? Query.isNull(k) : Query.equal(k, v as string | number | boolean),
		);
		queries.push(
			opts.latest ? Query.orderDesc("$createdAt") : Query.orderAsc("$createdAt"),
			Query.limit(opts.limit ?? 500),
		);
		const res = await this.db.listRows({ databaseId: this.databaseId, tableId: this.tableId, queries });
		const rows = res.rows.map((r) => this.fromRow(r));
		return opts.latest ? rows.reverse() : rows;
	}

	async create(data: NewRecord<T>) {
		const row = await this.db.createRow({
			databaseId: this.databaseId,
			tableId: this.tableId,
			rowId: ID.unique(),
			data: this.toRow(data as Record<string, unknown>),
			permissions: [],
		});
		return this.fromRow(row);
	}

	async update(id: string, patch: Partial<NewRecord<T>>) {
		const row = await this.db.updateRow({
			databaseId: this.databaseId,
			tableId: this.tableId,
			rowId: id,
			data: this.toRow(patch as Record<string, unknown>),
		});
		return this.fromRow(row);
	}

	async delete(id: string) {
		await this.db.deleteRow({ databaseId: this.databaseId, tableId: this.tableId, rowId: id });
	}
}

export function createAppwriteStore(adminClient: Client, databaseId: string): DataStore {
	const db = new TablesDB(adminClient);
	const make = <K extends TableName>(name: K) => new AppwriteTable<TableMap[K]>(db, databaseId, name);
	return {
		families: make("families"),
		family_members: make("family_members"),
		students: make("students"),
		learning_sessions: make("learning_sessions"),
		assessment_attempts: make("assessment_attempts"),
		student_competencies: make("student_competencies"),
		mastery_events: make("mastery_events"),
		revision_schedules: make("revision_schedules"),
		audit_logs: make("audit_logs"),
		knowledge_sources: make("knowledge_sources"),
		knowledge_versions: make("knowledge_versions"),
		learning_resources: make("learning_resources"),
		ingestion_jobs: make("ingestion_jobs"),
		worksheet_checks: make("worksheet_checks"),
	};
}
