import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_PACE_TARGET, programmeSettingsSchema } from "#/domain/types";
import { createMemoryStore } from "../store/memory-store";
import type { DataStore } from "../store/types";
import { type Actor, createFamilyForUser, createStudent, exportStudentData } from "./family";
import { programmeSettingsOf } from "./programme-settings";

const prefs = { readingSupport: false, theme: "calm" as const };
const DEFAULTS = { paused: false, skips: [], paceTarget: DEFAULT_PACE_TARGET, dailyNewStepCap: false };
const skip = {
	objectiveCode: "MA-Y3-AS-MENTAL",
	reason: "Already covered at school",
	byUserId: "user-alice",
	at: "2026-11-22T10:00:00.000Z",
};

describe("programme settings schema", () => {
	it("defaults every field for learners created before the settings existed", () => {
		expect(programmeSettingsOf({})).toEqual(DEFAULTS);
		expect(programmeSettingsOf({ programme: null })).toEqual(DEFAULTS);
		expect(programmeSettingsOf({ programme: undefined })).toEqual(DEFAULTS);
	});

	it("keeps stored values and fills the missing ones", () => {
		expect(programmeSettingsOf({ programme: { paused: true } as never })).toEqual({ ...DEFAULTS, paused: true });
	});

	it("rejects a skip without a reason or with an invalid date", () => {
		expect(programmeSettingsSchema.safeParse({ skips: [{ ...skip, reason: "  " }] }).success).toBe(false);
		expect(programmeSettingsSchema.safeParse({ skips: [{ ...skip, at: "yesterday" }] }).success).toBe(false);
		expect(programmeSettingsSchema.safeParse({ skips: [{ ...skip, reason: "x".repeat(201) }] }).success).toBe(false);
	});

	it("rejects a pace target outside 1 to 14 missions a week", () => {
		expect(programmeSettingsSchema.safeParse({ paceTarget: 0 }).success).toBe(false);
		expect(programmeSettingsSchema.safeParse({ paceTarget: 15 }).success).toBe(false);
	});
});

describe("programme settings storage", () => {
	let store: DataStore;
	let alice: Actor;
	let sam: string;

	beforeEach(async () => {
		store = createMemoryStore();
		alice = await createFamilyForUser(store, "user-alice", "Alice family");
		sam = (await createStudent(store, alice, { displayName: "Sam", yearGroup: 3, preferences: prefs })).id;
	});

	it("round-trips settings through the memory store", async () => {
		const settings = { paused: true, skips: [skip], paceTarget: 5, dailyNewStepCap: false };
		await store.students.update(sam, { programme: settings });
		const student = await store.students.get(sam);
		expect(programmeSettingsOf(student!)).toEqual(settings);
	});

	it("exports defaults for a learner without stored settings", async () => {
		const data = (await exportStudentData(store, alice, sam)) as { student: { programme: unknown } };
		expect(data.student.programme).toEqual(DEFAULTS);
	});

	it("exports stored settings", async () => {
		const settings = { paused: false, skips: [skip], paceTarget: 3, dailyNewStepCap: false };
		await store.students.update(sam, { programme: settings });
		const data = (await exportStudentData(store, alice, sam)) as { student: { programme: unknown } };
		expect(data.student.programme).toEqual(settings);
	});
});
