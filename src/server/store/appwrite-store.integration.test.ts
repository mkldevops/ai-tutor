import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildServerContext } from "#/server/backends";
import { loadConfig } from "#/server/config";

const enabled = process.env.APPWRITE_IT === "1";
const ROWS = 501;

describe.skipIf(!enabled)("Appwrite store paging (APPWRITE_IT=1, uses .env)", () => {
	it("listAll pages past 500 rows in creation order and keeps to the filter", async () => {
		process.loadEnvFile(".env");
		const { store } = buildServerContext(loadConfig({ ...process.env, KNOWLEDGE_INDEX: "memory" }));
		const studentId = `it-${randomUUID().slice(0, 30)}`;
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
		try {
			for (let start = 1; start <= ROWS; start += 25) {
				const batch = Array.from({ length: Math.min(25, ROWS - start + 1) }, (_, i) => start + i);
				await Promise.all(batch.map((n) => store.mastery_events.create(event(n))));
			}
			expect(await store.mastery_events.list({ studentId })).toHaveLength(500);
			const all = await store.mastery_events.listAll({ studentId });
			expect(all).toHaveLength(ROWS);
			expect(new Set(all.map((r) => r.id)).size).toBe(ROWS);
			expect(new Set(all.map((r) => r.objectiveCode)).size).toBe(ROWS);
			expect(all.every((r) => r.studentId === studentId)).toBe(true);
			const times = all.map((r) => Date.parse(r.createdAt));
			expect(times.every((t, i) => i === 0 || t >= times[i - 1])).toBe(true);
		} finally {
			for (const r of await store.mastery_events.listAll({ studentId })) await store.mastery_events.delete(r.id);
		}
		expect(await store.mastery_events.list({ studentId })).toHaveLength(0);
	}, 180_000);
});
