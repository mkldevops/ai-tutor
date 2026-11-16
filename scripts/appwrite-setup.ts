import { Client, TablesDB, TablesDBIndexType } from "node-appwrite";
import { ENGLAND_NC, OBJECTIVES, PREREQUISITES } from "../src/curriculum/england-nc-maths.ts";

type Column =
	| { kind: "string"; key: string; size: number; required?: boolean }
	| { kind: "longtext"; key: string; required?: boolean }
	| { kind: "integer"; key: string; required?: boolean; min?: number; max?: number }
	| { kind: "boolean"; key: string; required?: boolean }
	| { kind: "datetime"; key: string; required?: boolean }
	| { kind: "enum"; key: string; elements: string[]; required?: boolean };

type TableSpec = { id: string; columns: Column[]; indexes: { key: string; columns: string[]; unique?: boolean }[] };

const KNOWLEDGE_STATUSES = ["staged", "approved", "rejected", "superseded"];
const STATUSES = ["not_started", "emerging", "developing", "secure", "mastered", "needs_review"];
const id = (key: string): Column => ({ kind: "string", key, size: 36, required: true });

export const SCHEMA: TableSpec[] = [
	{
		id: "families",
		columns: [{ kind: "string", key: "name", size: 60, required: true }, id("ownerUserId")],
		indexes: [{ key: "by_owner", columns: ["ownerUserId"] }],
	},
	{
		id: "family_members",
		columns: [
			id("familyId"),
			id("userId"),
			{ kind: "enum", key: "role", elements: ["owner", "parent"], required: true },
		],
		indexes: [
			{ key: "by_user", columns: ["userId"], unique: true },
			{ key: "by_family", columns: ["familyId"] },
		],
	},
	{
		id: "students",
		columns: [
			id("familyId"),
			{ kind: "string", key: "displayName", size: 40, required: true },
			{ kind: "integer", key: "yearGroup", required: true, min: 1, max: 6 },
			{ kind: "string", key: "preferences", size: 2000, required: true },
		],
		indexes: [{ key: "by_family", columns: ["familyId"] }],
	},
	{
		id: "learning_sessions",
		columns: [
			id("familyId"),
			id("studentId"),
			{ kind: "string", key: "objectiveCode", size: 40, required: true },
			{ kind: "enum", key: "kind", elements: ["lesson", "review"], required: true },
			{ kind: "string", key: "phase", size: 20, required: true },
			{ kind: "longtext", key: "state", required: true },
			{ kind: "datetime", key: "completedAt" },
			{ kind: "string", key: "confidence", size: 200 },
		],
		indexes: [
			{ key: "by_student", columns: ["studentId"] },
			{ key: "by_family", columns: ["familyId"] },
		],
	},
	{
		id: "assessment_attempts",
		columns: [
			id("familyId"),
			id("studentId"),
			id("sessionId"),
			{ kind: "string", key: "objectiveCode", size: 40, required: true },
			{ kind: "enum", key: "mode", elements: ["diagnostic", "guided", "independent", "review"], required: true },
			{
				kind: "enum",
				key: "itemType",
				elements: ["numeric", "multiple_choice", "missing_number", "word_problem"],
				required: true,
			},
			{ kind: "string", key: "prompt", size: 500, required: true },
			{ kind: "string", key: "expected", size: 64, required: true },
			{ kind: "string", key: "response", size: 64, required: true },
			{ kind: "boolean", key: "correct", required: true },
			{ kind: "integer", key: "hintsUsed", required: true, min: 0, max: 100 },
		],
		indexes: [
			{ key: "by_student", columns: ["studentId"] },
			{ key: "by_session", columns: ["sessionId"] },
		],
	},
	{
		id: "student_competencies",
		columns: [
			id("familyId"),
			id("studentId"),
			{ kind: "string", key: "objectiveCode", size: 40, required: true },
			{ kind: "enum", key: "status", elements: STATUSES, required: true },
			{ kind: "enum", key: "computedStatus", elements: STATUSES, required: true },
			{ kind: "string", key: "reasons", size: 4000, required: true },
			{ kind: "datetime", key: "securedAt" },
			{ kind: "string", key: "override", size: 1000 },
		],
		indexes: [{ key: "by_student_objective", columns: ["studentId", "objectiveCode"], unique: true }],
	},
	{
		id: "mastery_events",
		columns: [
			id("familyId"),
			id("studentId"),
			{ kind: "string", key: "objectiveCode", size: 40, required: true },
			{ kind: "enum", key: "fromStatus", elements: STATUSES, required: true },
			{ kind: "enum", key: "toStatus", elements: STATUSES, required: true },
			{ kind: "enum", key: "actor", elements: ["system", "parent"], required: true },
			{ kind: "string", key: "actorUserId", size: 36 },
			{ kind: "string", key: "reason", size: 500, required: true },
		],
		indexes: [{ key: "by_student", columns: ["studentId"] }],
	},
	{
		id: "revision_schedules",
		columns: [
			id("familyId"),
			id("studentId"),
			{ kind: "string", key: "objectiveCode", size: 40, required: true },
			{ kind: "datetime", key: "dueAt", required: true },
			{ kind: "enum", key: "status", elements: ["pending", "done", "superseded"], required: true },
		],
		indexes: [{ key: "by_student_status", columns: ["studentId", "status"] }],
	},
	{
		id: "audit_logs",
		columns: [
			{ kind: "string", key: "familyId", size: 36 },
			{ kind: "string", key: "actorUserId", size: 36 },
			{ kind: "string", key: "action", size: 60, required: true },
			{ kind: "string", key: "target", size: 120, required: true },
			{ kind: "string", key: "detail", size: 4000, required: true },
		],
		indexes: [{ key: "by_family", columns: ["familyId"] }],
	},
	{
		id: "knowledge_sources",
		columns: [
			{ kind: "string", key: "sourceKey", size: 60, required: true },
			{ kind: "string", key: "publisher", size: 120, required: true },
			{ kind: "string", key: "title", size: 300, required: true },
			{ kind: "string", key: "pageUrl", size: 500, required: true },
			{ kind: "string", key: "licence", size: 120, required: true },
			{ kind: "enum", key: "redistribution", elements: ["allowed", "link_only"], required: true },
			{ kind: "enum", key: "status", elements: ["active", "disabled"], required: true },
			{ kind: "integer", key: "checkIntervalDays", required: true, min: 1, max: 365 },
			{ kind: "datetime", key: "lastCheckedAt" },
			{ kind: "datetime", key: "lastChangedAt" },
		],
		indexes: [{ key: "by_key", columns: ["sourceKey"], unique: true }],
	},
	{
		id: "knowledge_versions",
		columns: [
			id("sourceId"),
			{ kind: "integer", key: "version", required: true, min: 1 },
			{ kind: "string", key: "checksum", size: 64, required: true },
			{ kind: "string", key: "title", size: 300, required: true },
			{ kind: "datetime", key: "upstreamUpdatedAt" },
			{ kind: "datetime", key: "fetchedAt", required: true },
			{ kind: "enum", key: "status", elements: KNOWLEDGE_STATUSES, required: true },
			{ kind: "integer", key: "chunkCount", required: true, min: 0 },
			{ kind: "integer", key: "added", required: true, min: 0 },
			{ kind: "integer", key: "removed", required: true, min: 0 },
			{ kind: "integer", key: "flaggedCount", required: true, min: 0 },
			{ kind: "string", key: "reviewedByUserId", size: 36 },
			{ kind: "datetime", key: "reviewedAt" },
			{ kind: "string", key: "reviewNote", size: 500 },
		],
		indexes: [
			{ key: "by_source", columns: ["sourceId"] },
			{ key: "by_source_version", columns: ["sourceId", "version"], unique: true },
		],
	},
	{
		id: "learning_resources",
		columns: [
			id("sourceId"),
			id("versionId"),
			{ kind: "integer", key: "ordinal", required: true, min: 0 },
			{ kind: "string", key: "subject", size: 20, required: true },
			{ kind: "string", key: "yearGroups", size: 100, required: true },
			{ kind: "enum", key: "kind", elements: ["statutory", "guidance", "context"], required: true },
			{ kind: "string", key: "heading", size: 400, required: true },
			{ kind: "longtext", key: "text", required: true },
			{ kind: "string", key: "checksum", size: 64, required: true },
			{ kind: "string", key: "objectiveCodes", size: 1000, required: true },
			{ kind: "string", key: "flags", size: 1000, required: true },
			{ kind: "enum", key: "status", elements: KNOWLEDGE_STATUSES, required: true },
		],
		indexes: [
			{ key: "by_version", columns: ["versionId"] },
			{ key: "by_source_status", columns: ["sourceId", "status"] },
		],
	},
	{
		id: "ingestion_jobs",
		columns: [
			id("sourceId"),
			{ kind: "enum", key: "trigger", elements: ["manual", "scheduled"], required: true },
			{ kind: "enum", key: "status", elements: ["running", "staged", "unchanged", "failed"], required: true },
			{ kind: "string", key: "actorUserId", size: 36 },
			{ kind: "string", key: "versionId", size: 36 },
			{ kind: "datetime", key: "finishedAt" },
			{ kind: "string", key: "error", size: 1000 },
			{ kind: "string", key: "stats", size: 2000, required: true },
		],
		indexes: [{ key: "by_source", columns: ["sourceId"] }],
	},
	{
		id: "worksheet_checks",
		columns: [
			id("familyId"),
			id("studentId"),
			{ kind: "string", key: "objectiveCode", size: 40, required: true },
			{ kind: "string", key: "imageSha256", size: 64, required: true },
			{ kind: "string", key: "mimeType", size: 20, required: true },
			{ kind: "integer", key: "bytes", required: true, min: 0, max: 10_000_000 },
			{ kind: "string", key: "model", size: 120, required: true },
			{ kind: "enum", key: "imageQuality", elements: ["good", "poor", "unreadable"], required: true },
			{ kind: "longtext", key: "items", required: true },
			{ kind: "string", key: "handwriting", size: 1000, required: true },
			{ kind: "string", key: "flags", size: 1000, required: true },
			{ kind: "enum", key: "status", elements: ["pending_review", "reviewed"], required: true },
			{ kind: "string", key: "reviewedByUserId", size: 36 },
			{ kind: "datetime", key: "reviewedAt" },
			{ kind: "string", key: "parentNote", size: 1000 },
		],
		indexes: [
			{ key: "by_student", columns: ["studentId"] },
			{ key: "by_family", columns: ["familyId"] },
		],
	},
	{
		id: "curricula",
		columns: [
			{ kind: "string", key: "code", size: 40, required: true },
			{ kind: "string", key: "name", size: 200, required: true },
			{ kind: "string", key: "country", size: 10, required: true },
			{ kind: "string", key: "version", size: 120, required: true },
		],
		indexes: [{ key: "by_code", columns: ["code"], unique: true }],
	},
	{
		id: "learning_objectives",
		columns: [
			{ kind: "string", key: "code", size: 40, required: true },
			{ kind: "string", key: "curriculumCode", size: 40, required: true },
			{ kind: "string", key: "subject", size: 20, required: true },
			{ kind: "integer", key: "yearGroup", required: true, min: 1, max: 6 },
			{ kind: "string", key: "strand", size: 120, required: true },
			{ kind: "string", key: "statement", size: 1000, required: true },
			{ kind: "string", key: "assessmentCriteria", size: 4000, required: true },
			{ kind: "string", key: "source", size: 2000, required: true },
			{ kind: "enum", key: "status", elements: ["approved", "draft"], required: true },
		],
		indexes: [{ key: "by_code", columns: ["code"], unique: true }],
	},
	{
		id: "objective_prerequisites",
		columns: [
			{ kind: "string", key: "objectiveCode", size: 40, required: true },
			{ kind: "string", key: "prerequisiteCode", size: 40, required: true },
		],
		indexes: [{ key: "by_pair", columns: ["objectiveCode", "prerequisiteCode"], unique: true }],
	},
];

const isConflict = (e: unknown) => (e as { code?: number }).code === 409;
const isMissing = (e: unknown) => (e as { code?: number }).code === 404;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function ensure(label: string, fn: () => Promise<unknown>) {
	try {
		await fn();
		console.log(`created ${label}`);
	} catch (e) {
		if (!isConflict(e)) throw e;
	}
}

async function createColumn(db: TablesDB, databaseId: string, tableId: string, c: Column) {
	const base = { databaseId, tableId, key: c.key, required: c.required ?? false };
	switch (c.kind) {
		case "string":
			return db.createVarcharColumn({ ...base, size: c.size });
		case "longtext":
			return db.createLongtextColumn(base);
		case "integer":
			return db.createIntegerColumn({ ...base, min: c.min, max: c.max });
		case "boolean":
			return db.createBooleanColumn(base);
		case "datetime":
			return db.createDatetimeColumn(base);
		case "enum":
			return db.createEnumColumn({ ...base, elements: c.elements });
	}
}

async function waitForColumns(db: TablesDB, databaseId: string, tableId: string) {
	for (let i = 0; i < 60; i++) {
		const table = await db.getTable({ databaseId, tableId });
		const pending = (table.columns as { status?: string }[]).filter((c) => c.status !== "available");
		if (pending.length === 0) return;
		await sleep(1000);
	}
	throw new Error(`Columns of ${tableId} did not become available`);
}

async function upsertRow(db: TablesDB, databaseId: string, tableId: string, rowId: string, data: object) {
	try {
		await db.getRow({ databaseId, tableId, rowId });
		await db.updateRow({ databaseId, tableId, rowId, data });
	} catch (e) {
		if (!isMissing(e)) throw e;
		await db.createRow({ databaseId, tableId, rowId, data, permissions: [] });
	}
}

const rowId = (code: string) =>
	code
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "_")
		.slice(0, 36);

async function main() {
	const endpoint = process.env.APPWRITE_ENDPOINT;
	const project = process.env.APPWRITE_PROJECT_ID;
	const key = process.env.APPWRITE_API_KEY;
	const databaseId = process.env.APPWRITE_DATABASE_ID ?? "ai_tutor";
	if (!endpoint || !project || !key) {
		throw new Error("Set APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID and APPWRITE_API_KEY (server-only key).");
	}
	const db = new TablesDB(new Client().setEndpoint(endpoint).setProject(project).setKey(key));

	await ensure(`database ${databaseId}`, () => db.create({ databaseId, name: "AI Tutor" }));
	for (const t of SCHEMA) {
		await ensure(`table ${t.id}`, () =>
			db.createTable({ databaseId, tableId: t.id, name: t.id, permissions: [], rowSecurity: false }),
		);
		for (const c of t.columns) {
			await ensure(`${t.id}.${c.key}`, () => createColumn(db, databaseId, t.id, c));
		}
		await waitForColumns(db, databaseId, t.id);
		for (const ix of t.indexes) {
			await ensure(`${t.id} index ${ix.key}`, () =>
				db.createIndex({
					databaseId,
					tableId: t.id,
					key: ix.key,
					type: ix.unique ? TablesDBIndexType.Unique : TablesDBIndexType.Key,
					columns: ix.columns,
				}),
			);
		}
	}

	await upsertRow(db, databaseId, "curricula", rowId(ENGLAND_NC.code), {
		code: ENGLAND_NC.code,
		name: ENGLAND_NC.name,
		country: ENGLAND_NC.country,
		version: ENGLAND_NC.version,
	});
	for (const o of OBJECTIVES) {
		await upsertRow(db, databaseId, "learning_objectives", rowId(o.code), {
			code: o.code,
			curriculumCode: o.curriculumCode,
			subject: o.subject,
			yearGroup: o.yearGroup,
			strand: o.strand,
			statement: o.statement,
			assessmentCriteria: JSON.stringify(o.assessmentCriteria),
			source: JSON.stringify(o.source),
			status: o.status,
		});
	}
	for (const p of PREREQUISITES) {
		await upsertRow(db, databaseId, "objective_prerequisites", rowId(`${p.objectiveCode}__${p.prerequisiteCode}`), p);
	}
	console.log(`Appwrite schema ready: ${SCHEMA.length} tables, ${OBJECTIVES.length} objectives seeded.`);
}

main().catch((e) => {
	console.error("Appwrite setup failed:", e instanceof Error ? e.message : e);
	process.exit(1);
});
