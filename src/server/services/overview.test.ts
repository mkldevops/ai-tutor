import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryStore } from "../store/memory-store";
import type { DataStore } from "../store/types";
import { type Actor, createFamilyForUser, createStudent } from "./family";
import { allowedObjectives } from "./learning";
import { getFamilyOverview } from "./overview";

const prefs = { readingSupport: false, theme: "calm" as const };
const NOW = new Date("2026-11-16T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

describe("family overview", () => {
	let store: DataStore;
	let alice: Actor;
	let bob: Actor;
	let sam: string;
	let code: string;

	beforeEach(async () => {
		store = createMemoryStore();
		alice = await createFamilyForUser(store, "user-alice", "Alice family");
		bob = await createFamilyForUser(store, "user-bob", "Bob family");
		sam = (await createStudent(store, alice, { displayName: "Sam", yearGroup: 3, preferences: prefs })).id;
		code = allowedObjectives(3)[0] as string;
	});

	it("summarises status, weekly work and reviews per learner", async () => {
		await store.student_competencies.create({
			familyId: alice.familyId,
			studentId: sam,
			objectiveCode: code,
			status: "secure",
			computedStatus: "secure",
			reasons: [],
			securedAt: daysAgo(8),
			override: null,
		});
		for (const dueAt of [daysAgo(1), daysAgo(-3)]) {
			await store.revision_schedules.create({
				familyId: alice.familyId,
				studentId: sam,
				objectiveCode: code,
				dueAt,
				status: "pending",
			});
		}
		const [only] = await getFamilyOverview({ store, now: () => NOW }, alice);
		expect(only).toMatchObject({
			displayName: "Sam",
			objectives: allowedObjectives(3).length,
			secure: 1,
			inProgress: 0,
			reviewsDue: 1,
			nextReviewAt: daysAgo(-3),
			lastActiveAt: null,
			week: { answers: 0, correct: 0 },
		});
	});

	it("counts only answers from the last seven days", async () => {
		await store.assessment_attempts.create({
			familyId: alice.familyId,
			studentId: sam,
			objectiveCode: code,
			sessionId: "s1",
			mode: "guided",
			itemType: "numeric",
			prompt: "1 + 1",
			expected: "2",
			response: "2",
			correct: true,
			hintsUsed: 0,
		});
		const [fresh] = await getFamilyOverview({ store }, alice);
		expect(fresh?.week).toEqual({ answers: 1, correct: 1 });
		const [later] = await getFamilyOverview({ store, now: () => new Date(Date.now() + 8 * 86_400_000) }, alice);
		expect(later?.week).toEqual({ answers: 0, correct: 0 });
		expect(later?.lastActiveAt).not.toBeNull();
	});

	it("never includes another family's learners", async () => {
		expect(await getFamilyOverview({ store }, bob)).toEqual([]);
	});
});
