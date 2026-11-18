import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LESSON_EXPIRY_DAYS } from "../config";
import { createMemoryStore } from "../store/memory-store";
import type { DataStore } from "../store/types";
import { type Actor, createFamilyForUser, createStudent } from "./family";
import { answerSession, startSession } from "./learning";

const DAY = 86_400_000;
const T0 = new Date("2026-11-01T09:00:00.000Z");
const CODE = "MA-Y3-AS-MENTAL";

describe("unfinished lesson expiry", () => {
	let store: DataStore;
	let actor: Actor;
	let studentId: string;

	beforeEach(async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(T0);
		store = createMemoryStore();
		actor = await createFamilyForUser(store, "user-qa", "QA family");
		studentId = (
			await createStudent(store, actor, {
				displayName: "QA Test",
				yearGroup: 3,
				preferences: { readingSupport: false, theme: "calm" },
			})
		).id;
	});

	afterEach(() => vi.useRealTimers());

	it("resumes an open lesson before it expires", async () => {
		const first = await startSession({ store }, actor, { studentId, objectiveCode: CODE, kind: "lesson" });
		vi.setSystemTime(new Date(T0.getTime() + (LESSON_EXPIRY_DAYS - 1) * DAY));
		const again = await startSession({ store }, actor, { studentId, objectiveCode: CODE, kind: "lesson" });
		expect(again.sessionId).toBe(first.sessionId);
		await expect(answerSession({ store }, actor, first.sessionId, "1")).resolves.toBeDefined();
	});

	it("refuses to advance an expired lesson and starts a fresh one instead", async () => {
		const first = await startSession({ store }, actor, { studentId, objectiveCode: CODE, kind: "lesson" });
		vi.setSystemTime(new Date(T0.getTime() + LESSON_EXPIRY_DAYS * DAY));
		await expect(answerSession({ store }, actor, first.sessionId, "1")).rejects.toThrow(/expired/);
		const fresh = await startSession({ store }, actor, { studentId, objectiveCode: CODE, kind: "lesson" });
		expect(fresh.sessionId).not.toBe(first.sessionId);
	});
});
