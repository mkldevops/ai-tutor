import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildServerContext } from "#/server/backends";
import { loadConfig } from "#/server/config";
import type { DataStore } from "#/server/store/types";

const enabled = process.env.APPWRITE_IT === "1";
const ROWS = 501;

describe.skipIf(!enabled)("Appwrite store paging (APPWRITE_IT=1, uses .env)", () => {
	const studentId = `it-${randomUUID().slice(0, 30)}`;
	let store: DataStore;

	beforeAll(async () => {
		process.loadEnvFile(".env");
		store = buildServerContext(loadConfig({ ...process.env, KNOWLEDGE_INDEX: "memory" })).store;
		const event = (n: number) => ({
			familyId: "it-family",
			studentId,
			objectiveCode: `OBJ-${n}`,
			fromStatus: "not_started" as const,
			toStatus: "emerging" as const,
			actor: "system" as const,
			actorUserId: null,
			reason: "paging integration test",
		});
		for (let start = 1; start <= ROWS; start += 25) {
			const batch = Array.from({ length: Math.min(25, ROWS - start + 1) }, (_, i) => start + i);
			await Promise.all(batch.map((n) => store.mastery_events.create(event(n))));
		}
	}, 180_000);

	afterAll(async () => {
		for (const r of await store.mastery_events.listAll({ studentId })) await store.mastery_events.delete(r.id);
		expect(await store.mastery_events.list({ studentId })).toHaveLength(0);
	}, 180_000);

	const isAscending = (rows: { createdAt: string }[]) => {
		const times = rows.map((r) => Date.parse(r.createdAt));
		return times.every((t, i) => i === 0 || t >= times[i - 1]);
	};

	it("listAll pages past 500 rows in creation order and keeps to the filter", async () => {
		expect(await store.mastery_events.list({ studentId })).toHaveLength(500);
		const all = await store.mastery_events.listAll({ studentId });
		expect(all).toHaveLength(ROWS);
		expect(new Set(all.map((r) => r.id)).size).toBe(ROWS);
		expect(new Set(all.map((r) => r.objectiveCode)).size).toBe(ROWS);
		expect(all.every((r) => r.studentId === studentId)).toBe(true);
		expect(isAscending(all)).toBe(true);
	}, 60_000);

	it("listLatest keeps the newest rows across a page boundary and flags truncation", async () => {
		const all = await store.mastery_events.listAll({ studentId });

		const capped = await store.mastery_events.listLatest({ studentId }, 500);
		expect(capped.truncated).toBe(true);
		expect(capped.rows).toHaveLength(500);
		expect(new Set(capped.rows.map((r) => r.id)).size).toBe(500);
		expect(isAscending(capped.rows)).toBe(true);
		const kept = new Set(capped.rows.map((r) => r.id));
		const dropped = all.filter((r) => !kept.has(r.id));
		expect(dropped).toHaveLength(1);
		expect(Date.parse(dropped[0].createdAt)).toBeLessThanOrEqual(Date.parse(capped.rows[0].createdAt));

		const exact = await store.mastery_events.listLatest({ studentId }, ROWS);
		expect(exact.truncated).toBe(false);
		expect(exact.rows.map((r) => r.id).sort()).toEqual(all.map((r) => r.id).sort());
		expect(isAscending(exact.rows)).toBe(true);

		const roomy = await store.mastery_events.listLatest({ studentId }, 600);
		expect(roomy.truncated).toBe(false);
		expect(roomy.rows).toHaveLength(ROWS);

		const small = await store.mastery_events.listLatest({ studentId }, 10);
		expect(small.truncated).toBe(true);
		expect(small.rows).toHaveLength(10);
		expect(isAscending(small.rows)).toBe(true);
		const newest = all.slice(-10).map((r) => Date.parse(r.createdAt));
		expect(Math.min(...small.rows.map((r) => Date.parse(r.createdAt)))).toBeGreaterThanOrEqual(Math.min(...newest));
		expect(small.rows.every((r) => r.studentId === studentId)).toBe(true);
	}, 60_000);
});
