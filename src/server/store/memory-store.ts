import { randomUUID } from "node:crypto";
import type { BaseRecord, DataStore, Filter, ListOptions, NewRecord, Table, TableName } from "./types";

class MemoryTable<T extends BaseRecord> implements Table<T> {
	private rows = new Map<string, T>();

	async get(id: string) {
		const row = this.rows.get(id);
		return row ? structuredClone(row) : null;
	}

	async list(filter: Filter<T>, opts: ListOptions = {}) {
		const entries = Object.entries(filter) as [keyof T, unknown][];
		const limit = opts.limit ?? 500;
		const rows = [...this.rows.values()]
			.filter((r) => entries.every(([k, v]) => r[k] === v))
			.filter((r) => !opts.createdBefore || r.createdAt < opts.createdBefore)
			.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
		return (opts.latest ? rows.slice(-limit) : rows.slice(0, limit)).map((r) => structuredClone(r));
	}

	async listAll(filter: Filter<T>) {
		return this.list(filter, { limit: Number.POSITIVE_INFINITY });
	}

	async listLatest(filter: Filter<T>, max: number) {
		const rows = await this.list(filter, { limit: max + 1, latest: true });
		return rows.length > max ? { rows: rows.slice(1), truncated: true } : { rows, truncated: false };
	}

	async create(data: NewRecord<T>) {
		const now = new Date().toISOString();
		const row = { ...structuredClone(data), id: randomUUID().replace(/-/g, ""), createdAt: now, updatedAt: now } as T;
		this.rows.set(row.id, row);
		return structuredClone(row);
	}

	async update(id: string, patch: Partial<NewRecord<T>>) {
		const row = this.rows.get(id);
		if (!row) throw new Error(`Row ${id} not found`);
		const next = { ...row, ...structuredClone(patch), updatedAt: new Date().toISOString() };
		this.rows.set(id, next);
		return structuredClone(next);
	}

	async delete(id: string) {
		this.rows.delete(id);
	}
}

const TABLES: TableName[] = [
	"families",
	"family_members",
	"students",
	"learning_sessions",
	"assessment_attempts",
	"student_competencies",
	"mastery_events",
	"revision_schedules",
	"audit_logs",
	"knowledge_sources",
	"knowledge_versions",
	"learning_resources",
	"ingestion_jobs",
	"worksheet_checks",
	"session_messages",
];

export function createMemoryStore(): DataStore {
	return Object.fromEntries(TABLES.map((t) => [t, new MemoryTable()])) as unknown as DataStore;
}
