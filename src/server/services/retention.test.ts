import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryRateLimiter } from "../rate-limit";
import { createMemoryStore } from "../store/memory-store";
import type { DataStore } from "../store/types";
import { DEFAULT_RETENTION, purgeExpiredData, type RetentionPolicy } from "./retention";

const NOW = new Date("2026-11-18T03:41:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);

const ids = { familyId: "f", studentId: "s", objectiveCode: "Y4-NPV-01" };

async function at<T>(days: number, make: () => Promise<T>): Promise<T> {
	vi.setSystemTime(ago(days));
	return make();
}

async function seed(store: DataStore) {
	const session = (completedAt: string | null) =>
		store.learning_sessions.create({ ...ids, kind: "lesson", phase: "teach", state: {}, completedAt } as never);
	await at(40, () => session(null));
	await at(10, () => session(null));
	await at(800, () => session(ago(800).toISOString()));
	await at(5, () => session(ago(5).toISOString()));
	const check = () =>
		store.worksheet_checks.create({
			...ids,
			imageSha256: "0".repeat(64),
			mimeType: "image/jpeg",
			bytes: 10,
			model: "m",
			imageQuality: "good",
			items: [],
			handwriting: { note: "", confidence: "low" },
			flags: [],
			status: "reviewed",
			reviewedByUserId: null,
			reviewedAt: null,
			parentNote: null,
		});
	await at(100, check);
	await at(20, check);
	const attempt = () =>
		store.assessment_attempts.create({
			...ids,
			sessionId: "x",
			mode: "independent",
			itemType: "short_answer",
			prompt: "p",
			expected: "e",
			response: "r",
			correct: true,
			hintsUsed: 0,
		} as never);
	await at(800, attempt);
	await at(5, attempt);
	const event = () =>
		store.mastery_events.create({
			...ids,
			fromStatus: "not_started",
			toStatus: "emerging",
			actor: "system",
			actorUserId: null,
			reason: "",
		});
	await at(800, event);
	const schedule = (status: "pending" | "done" | "superseded") =>
		store.revision_schedules.create({ ...ids, dueAt: ago(790).toISOString(), status });
	await at(800, () => schedule("pending"));
	await at(800, () => schedule("done"));
	await at(800, () => schedule("superseded"));
	const message = (text: string) =>
		store.session_messages.create({
			familyId: "f",
			studentId: "s",
			sessionId: "x",
			role: "child",
			text,
			expiresAt: NOW.toISOString(),
		});
	await at(40, () => message("old chat"));
	await at(5, () => message("recent chat"));
	await at(500, () =>
		store.audit_logs.create({ familyId: "f", actorUserId: null, action: "old", target: "t", detail: {} }),
	);
	await at(1, () =>
		store.audit_logs.create({ familyId: "f", actorUserId: null, action: "new", target: "t", detail: {} }),
	);
	vi.setSystemTime(NOW);
}

afterEach(() => vi.useRealTimers());

describe("purgeExpiredData", () => {
	it("only counts in a dry run and writes no audit entry", async () => {
		vi.useFakeTimers();
		const store = createMemoryStore();
		await seed(store);
		const report = await purgeExpiredData({ store }, DEFAULT_RETENTION, { dryRun: true, now: NOW });
		expect(report.counts).toEqual({ open_sessions: 1, worksheet_checks: 1, session_messages: 1, audit_logs: 1 });
		expect(report.truncated).toEqual([]);
		expect(await store.learning_sessions.listAll({})).toHaveLength(4);
		expect(await store.session_messages.listAll({})).toHaveLength(2);
		expect(await store.audit_logs.listAll({ action: "retention.purge" })).toHaveLength(0);
	});

	it("deletes ephemeral data, keeps mastery evidence by default and audits the purge", async () => {
		vi.useFakeTimers();
		const store = createMemoryStore();
		const rateLimiter = createMemoryRateLimiter();
		await rateLimiter.hit("k", 60_000, NOW.getTime() - DAY);
		await seed(store);
		const report = await purgeExpiredData({ store, rateLimiter }, DEFAULT_RETENTION, { dryRun: false, now: NOW });
		expect(report.counts).toEqual({
			open_sessions: 1,
			worksheet_checks: 1,
			session_messages: 1,
			audit_logs: 1,
			rate_limits: 1,
		});
		expect((await store.session_messages.listAll({})).map((m) => m.text)).toEqual(["recent chat"]);
		const sessions = await store.learning_sessions.listAll({});
		expect(sessions).toHaveLength(3);
		expect(sessions.filter((s) => s.completedAt === null)).toHaveLength(1);
		expect(await store.worksheet_checks.listAll({})).toHaveLength(1);
		expect(await store.assessment_attempts.listAll({})).toHaveLength(2);
		expect(await store.mastery_events.listAll({})).toHaveLength(1);
		expect(await store.revision_schedules.listAll({})).toHaveLength(3);
		const logs = await store.audit_logs.listAll({});
		expect(logs.map((l) => l.action)).toEqual(["new", "retention.purge"]);
		expect(logs[1]).toMatchObject({ familyId: null, actorUserId: null, target: "retention" });
		expect(logs[1].detail).toMatchObject({ counts: report.counts, truncated: [] });
		expect(JSON.stringify(logs[1].detail)).not.toContain("chat");
	});

	it("follows the configured chat message window", async () => {
		vi.useFakeTimers();
		const store = createMemoryStore();
		await seed(store);
		const policy: RetentionPolicy = { ...DEFAULT_RETENTION, sessionMessageDays: 3 };
		const report = await purgeExpiredData({ store }, policy, { dryRun: false, now: NOW });
		expect(report.counts.session_messages).toBe(2);
		expect(await store.session_messages.listAll({})).toHaveLength(0);
		const [entry] = await store.audit_logs.listAll({ action: "retention.purge" });
		expect(entry.detail).toMatchObject({ policy: { sessionMessageDays: 3 }, counts: { session_messages: 2 } });
	});

	it("purges old evidence only when an evidence window is set, keeping pending revisions", async () => {
		vi.useFakeTimers();
		const store = createMemoryStore();
		await seed(store);
		const policy: RetentionPolicy = { ...DEFAULT_RETENTION, evidenceDays: 730 };
		const report = await purgeExpiredData({ store }, policy, { dryRun: false, now: NOW });
		expect(report.counts).toMatchObject({
			evidence_sessions: 1,
			evidence_attempts: 1,
			evidence_mastery_events: 1,
			evidence_revision_schedules: 2,
		});
		expect(await store.assessment_attempts.listAll({})).toHaveLength(1);
		expect(await store.mastery_events.listAll({})).toHaveLength(0);
		expect((await store.revision_schedules.listAll({})).map((r) => r.status)).toEqual(["pending"]);
	});

	it("stops at the per-step cap and reports the step as truncated", async () => {
		vi.useFakeTimers();
		const store = createMemoryStore();
		vi.setSystemTime(ago(500));
		for (let i = 0; i < 5; i++) {
			await store.audit_logs.create({ familyId: "f", actorUserId: null, action: "old", target: "t", detail: {} });
		}
		vi.setSystemTime(NOW);
		const dry = await purgeExpiredData({ store }, DEFAULT_RETENTION, { dryRun: true, now: NOW, maxPerStep: 3 });
		expect(dry).toMatchObject({ counts: { audit_logs: 3 }, truncated: ["audit_logs"] });
		const real = await purgeExpiredData({ store }, DEFAULT_RETENTION, { dryRun: false, now: NOW, maxPerStep: 3 });
		expect(real).toMatchObject({ counts: { audit_logs: 3 }, truncated: ["audit_logs"] });
		expect(await store.audit_logs.listAll({ action: "old" })).toHaveLength(2);
	});

	it("previews the same rows a real run would delete, without double counting", async () => {
		vi.useFakeTimers();
		const store = createMemoryStore();
		await seed(store);
		const policy: RetentionPolicy = { ...DEFAULT_RETENTION, evidenceDays: 730 };
		await at(800, () =>
			store.learning_sessions.create({ ...ids, kind: "lesson", phase: "teach", state: {}, completedAt: null } as never),
		);
		vi.setSystemTime(NOW);
		const dry = await purgeExpiredData({ store }, policy, { dryRun: true, now: NOW });
		const real = await purgeExpiredData({ store }, policy, { dryRun: false, now: NOW });
		expect(dry.counts).toEqual(real.counts);
		expect(real.counts).toMatchObject({ open_sessions: 2, evidence_sessions: 1 });
	});

	it("shares one cap between done and superseded revisions", async () => {
		vi.useFakeTimers();
		const store = createMemoryStore();
		vi.setSystemTime(ago(800));
		for (const status of ["done", "done", "superseded", "superseded"] as const) {
			await store.revision_schedules.create({ ...ids, dueAt: ago(790).toISOString(), status });
		}
		vi.setSystemTime(NOW);
		const policy: RetentionPolicy = { ...DEFAULT_RETENTION, evidenceDays: 730 };
		const report = await purgeExpiredData({ store }, policy, { dryRun: false, now: NOW, maxPerStep: 3 });
		expect(report.counts.evidence_revision_schedules).toBe(3);
		expect(report.truncated).toContain("evidence_revision_schedules");
		expect(await store.revision_schedules.listAll({})).toHaveLength(1);
	});

	it("keeps a lesson completed after the sweep listed it", async () => {
		vi.useFakeTimers();
		const store = createMemoryStore();
		await seed(store);
		const table = store.learning_sessions;
		const list = table.list.bind(table);
		table.list = async (filter, opts) => {
			const rows = await list(filter, opts);
			for (const r of rows) if (r.completedAt === null) await table.update(r.id, { completedAt: NOW.toISOString() });
			return rows;
		};
		const report = await purgeExpiredData({ store }, DEFAULT_RETENTION, { dryRun: false, now: NOW });
		expect(report.counts.open_sessions).toBe(0);
		expect(await list({}, {})).toHaveLength(4);
	});

	it("skips rows another run already deleted", async () => {
		vi.useFakeTimers();
		const store = createMemoryStore();
		await seed(store);
		const table = store.audit_logs;
		const remove = table.delete.bind(table);
		table.delete = async (id) => {
			await remove(id);
			throw Object.assign(new Error("Row not found"), { code: 404 });
		};
		const report = await purgeExpiredData({ store }, DEFAULT_RETENTION, { dryRun: false, now: NOW });
		expect(report.counts.audit_logs).toBe(0);
		expect((await store.audit_logs.listAll({ action: "retention.purge" })).length).toBe(1);
	});

	it("audits the rows deleted before a failure and rethrows the error", async () => {
		vi.useFakeTimers();
		const store = createMemoryStore();
		vi.setSystemTime(ago(100));
		for (let i = 0; i < 3; i++) {
			await store.worksheet_checks.create({
				...ids,
				imageSha256: "0".repeat(64),
				mimeType: "image/jpeg",
				bytes: 10,
				model: "m",
				imageQuality: "good",
				items: [],
				handwriting: { note: "", confidence: "low" },
				flags: [],
				status: "reviewed",
				reviewedByUserId: null,
				reviewedAt: null,
				parentNote: null,
			});
		}
		vi.setSystemTime(NOW);
		const table = store.worksheet_checks;
		const remove = table.delete.bind(table);
		let calls = 0;
		table.delete = async (id) => {
			calls += 1;
			if (calls === 2) throw Object.assign(new Error("server down"), { code: 500 });
			return remove(id);
		};
		await expect(purgeExpiredData({ store }, DEFAULT_RETENTION, { dryRun: false, now: NOW })).rejects.toThrow(
			"server down",
		);
		const [entry] = await store.audit_logs.listAll({ action: "retention.purge" });
		expect(entry.detail).toMatchObject({
			counts: { open_sessions: 0, worksheet_checks: 1 },
			failed: { step: "worksheet_checks", error: "server down" },
		});
	});
});
