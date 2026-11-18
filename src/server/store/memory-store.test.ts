import { describe, expect, it } from "vitest";
import { createMemoryStore } from "./memory-store";

const event = (n: number) => ({
	familyId: "f",
	studentId: "s",
	objectiveCode: `OBJ-${n}`,
	fromStatus: "not_started" as const,
	toStatus: "emerging" as const,
	actor: "system" as const,
	actorUserId: null,
	reason: "",
});

describe("memory store list", () => {
	it("returns the oldest rows by default and the newest rows, still oldest first, with latest", async () => {
		const store = createMemoryStore();
		for (let n = 1; n <= 5; n++) await store.mastery_events.create(event(n));
		const codes = (rows: { objectiveCode: string }[]) => rows.map((r) => r.objectiveCode);
		expect(codes(await store.mastery_events.list({ studentId: "s" }, { limit: 2 }))).toEqual(["OBJ-1", "OBJ-2"]);
		expect(codes(await store.mastery_events.list({ studentId: "s" }, { limit: 2, latest: true }))).toEqual([
			"OBJ-4",
			"OBJ-5",
		]);
	});

	it("listAll returns every matching row beyond the default limit", async () => {
		const store = createMemoryStore();
		for (let n = 1; n <= 501; n++) await store.mastery_events.create(event(n));
		expect(await store.mastery_events.list({ studentId: "s" })).toHaveLength(500);
		const all = await store.mastery_events.listAll({ studentId: "s" });
		expect(all).toHaveLength(501);
		expect(all.at(-1)?.objectiveCode).toBe("OBJ-501");
	});
});

describe("memory store createdBefore", () => {
	it("returns only rows created strictly before the cutoff", async () => {
		const store = createMemoryStore();
		await store.mastery_events.create(event(1));
		const cutoff = new Date(Date.now() + 1000).toISOString();
		expect(await store.mastery_events.list({}, { createdBefore: cutoff })).toHaveLength(1);
		expect(await store.mastery_events.list({}, { createdBefore: "2000-01-01T00:00:00.000Z" })).toHaveLength(0);
	});
});
