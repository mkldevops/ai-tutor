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
});
