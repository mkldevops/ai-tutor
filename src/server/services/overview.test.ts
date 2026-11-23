import { beforeEach, describe, expect, it } from "vitest";
import { PROGRAMME_BY_YEAR, programmeSteps } from "#/curriculum/programme";
import { createMemoryStore } from "../store/memory-store";
import type { DataStore } from "../store/types";
import { type Actor, createFamilyForUser, createStudent } from "./family";
import { allowedObjectives } from "./learning";
import { getFamilyOverview } from "./overview";
import { openLegacySession, placeAt } from "./programme-fixtures";

const prefs = { readingSupport: false, theme: "calm" as const };
const NOW = new Date("2026-11-16T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const PLACED = "MA-Y3-AS-MENTAL";

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
	async function failIndependentAssessment(objectiveCode: string) {
		const session = await openLegacySession(store, sam, objectiveCode);
		for (let i = 0; i < 5; i++) {
			await store.assessment_attempts.create({
				familyId: alice.familyId,
				studentId: sam,
				objectiveCode,
				sessionId: session.id,
				mode: "independent",
				itemType: "numeric",
				prompt: "p",
				expected: "1",
				response: i < 2 ? "1" : "2",
				correct: i < 2,
				hintsUsed: 0,
			});
		}
		await store.learning_sessions.update(session.id, { completedAt: new Date().toISOString() });
	}

	it("places a new learner at unit 1, step 1 with no attention flag", async () => {
		const [only] = await getFamilyOverview({ store }, alice);
		expect(only?.position).toEqual({
			unit: { number: 1, total: PROGRAMME_BY_YEAR[3].length },
			step: { number: 1, total: programmeSteps(3).length },
			complete: false,
		});
		expect(only?.attention).toEqual([]);
	});

	it("shows pace against the learner's target", async () => {
		const later = { store, now: () => new Date(Date.now() + 10 * 86_400_000) };
		const [idle] = await getFamilyOverview(later, alice);
		expect(idle?.pace).toMatchObject({ status: "behind", target: 4, missionsThisWeek: 0, basis: "target" });

		await store.students.update(sam, { programme: { paused: true, skips: [], paceTarget: 4, dailyNewStepCap: false } });
		const [paused] = await getFamilyOverview(later, alice);
		expect(paused?.pace.status).toBe("paused");
	});

	it("reports the unit and step after acquired steps", async () => {
		await placeAt(store, sam, PLACED);
		const [only] = await getFamilyOverview({ store }, alice);
		expect(only?.position.unit).toEqual({ number: 4, total: PROGRAMME_BY_YEAR[3].length });
		expect(only?.position.step).toEqual({ number: 7, total: programmeSteps(3).length });
	});

	it("flags a stuck step after two failed independent assessments", async () => {
		await placeAt(store, sam, PLACED);
		await failIndependentAssessment(PLACED);
		const [once] = await getFamilyOverview({ store }, alice);
		expect(once?.attention).not.toContain("stuck");
		await failIndependentAssessment(PLACED);
		const [twice] = await getFamilyOverview({ store }, alice);
		expect(twice?.attention).toContain("stuck");
	});

	it("flags overdue reviews only once they are a day late", async () => {
		const at = Date.now();
		await store.revision_schedules.create({
			familyId: alice.familyId,
			studentId: sam,
			objectiveCode: code,
			dueAt: new Date(at - 3_600_000).toISOString(),
			status: "pending",
		});
		const [fresh] = await getFamilyOverview({ store, now: () => new Date(at) }, alice);
		expect(fresh).toMatchObject({ reviewsDue: 1, overdueReviews: 0 });
		expect(fresh?.attention).not.toContain("overdue_reviews");
		const [late] = await getFamilyOverview({ store, now: () => new Date(at + 86_400_000) }, alice);
		expect(late).toMatchObject({ reviewsDue: 1, overdueReviews: 1 });
		expect(late?.attention).toContain("overdue_reviews");
	});

	it("flags a learner inactive for seven days, counting from creation when they never practised", async () => {
		const at = Date.now();
		const inDays = (n: number) => () => new Date(at + n * 86_400_000);
		const [idle] = await getFamilyOverview({ store, now: inDays(8) }, alice);
		expect(idle?.attention).toEqual(["inactive"]);
		await failIndependentAssessment(code);
		const [active] = await getFamilyOverview({ store, now: inDays(6) }, alice);
		expect(active?.attention).not.toContain("inactive");
		const [lapsed] = await getFamilyOverview({ store, now: inDays(8) }, alice);
		expect(lapsed?.attention).toContain("inactive");
	});
});
