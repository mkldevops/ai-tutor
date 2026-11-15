import { randomUUID } from "node:crypto";
import type { BaseRecord, DataStore, Filter, NewRecord, Table, TableName } from "./types";

class MemoryTable<T extends BaseRecord> implements Table<T> {
	private rows = new Map<string, T>();

	async get(id: string) {
		const row = this.rows.get(id);
		return row ? structuredClone(row) : null;
	}

	async list(filter: Filter<T>, opts: { limit?: number } = {}) {
		const entries = Object.entries(filter) as [keyof T, unknown][];
		return [...this.rows.values()]
			.filter((r) => entries.every(([k, v]) => r[k] === v))
			.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
			.slice(0, opts.limit ?? 500)
			.map((r) => structuredClone(r));
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
];

export function createMemoryStore(): DataStore {
	return Object.fromEntries(TABLES.map((t) => [t, new MemoryTable()])) as unknown as DataStore;
}
