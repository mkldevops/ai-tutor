import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryStore } from "../store/memory-store";
import type { DataStore } from "../store/types";
import { AppError } from "./errors";
import { type Actor, createFamilyForUser, createStudent, setStudentVoice } from "./family";
import { getSession, startSession } from "./learning";
import { placeAt } from "./programme-fixtures";

const prefs = { readingSupport: true, theme: "bright" as const };

describe("voice pilot preference", () => {
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

	it("is off by default and reaches the lesson once switched on", async () => {
		await placeAt(store, sam, "MA-Y3-AS-MENTAL");
		const started = await startSession({ store }, alice, {
			studentId: sam,
			objectiveCode: "MA-Y3-AS-MENTAL",
			kind: "lesson",
		});
		expect(started.voice).toBe(false);

		await setStudentVoice(store, alice, sam, true);
		expect((await getSession({ store }, alice, started.sessionId)).voice).toBe(true);
	});

	it("keeps the other preferences and writes an audit entry", async () => {
		await setStudentVoice(store, alice, sam, true);
		const student = await store.students.get(sam);
		expect(student?.preferences).toEqual({ ...prefs, voice: true });
		const logs = await store.audit_logs.list({ action: "student.voice" });
		expect(logs).toHaveLength(1);
		expect(logs[0]?.detail).toEqual({ enabled: true });
	});

	it("refuses another family", async () => {
		await expect(setStudentVoice(store, bob, sam, true)).rejects.toBeInstanceOf(AppError);
		expect((await store.students.get(sam))?.preferences.voice).toBeUndefined();
	});
});
