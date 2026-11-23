import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryStore } from "../store/memory-store";
import type { DataStore } from "../store/types";
import { type Actor, createFamilyForUser, createStudent } from "./family";
import { setPaceTarget } from "./pace";
import { programmeSettingsOf } from "./programme-settings";

const prefs = { readingSupport: false, theme: "calm" as const };
const skip = {
	objectiveCode: "MA-Y3-AS-MENTAL",
	reason: "Done at school",
	byUserId: "user-alice",
	at: "2026-11-22T10:00:00.000Z",
};

describe("setPaceTarget", () => {
	let store: DataStore;
	let alice: Actor;
	let bob: Actor;
	let sam: string;

	beforeEach(async () => {
		store = createMemoryStore();
		alice = await createFamilyForUser(store, "user-alice", "Alice family");
		bob = await createFamilyForUser(store, "user-bob", "Bob family");
		sam = (await createStudent(store, alice, { displayName: "Sam", yearGroup: 3, preferences: prefs })).id;
	});

	it("stores the target, keeps the other settings and audits the change", async () => {
		await store.students.update(sam, {
			programme: { paused: true, skips: [skip], paceTarget: 4, dailyNewStepCap: false },
		});
		await setPaceTarget(store, alice, sam, 6);
		const student = await store.students.get(sam);
		expect(programmeSettingsOf(student!)).toEqual({
			paused: true,
			skips: [skip],
			paceTarget: 6,
			dailyNewStepCap: false,
		});
		const logs = await store.audit_logs.list({ familyId: alice.familyId });
		expect(logs.find((l) => l.action === "programme.pace")).toMatchObject({
			actorUserId: "user-alice",
			target: `students/${sam}`,
			detail: { from: 4, to: 6 },
		});
	});

	it("defaults the other settings for a learner without stored settings", async () => {
		await setPaceTarget(store, alice, sam, 2);
		expect(programmeSettingsOf((await store.students.get(sam))!)).toEqual({
			paused: false,
			skips: [],
			paceTarget: 2,
			dailyNewStepCap: false,
		});
	});

	it("rejects a target outside 1 to 14", async () => {
		await expect(setPaceTarget(store, alice, sam, 0)).rejects.toThrow();
		await expect(setPaceTarget(store, alice, sam, 15)).rejects.toThrow();
		expect((await store.students.get(sam))?.programme ?? null).toBeNull();
	});

	it("keeps another family out", async () => {
		await expect(setPaceTarget(store, bob, sam, 6)).rejects.toMatchObject({ code: "not_found" });
		expect((await store.students.get(sam))?.programme ?? null).toBeNull();
	});
});
