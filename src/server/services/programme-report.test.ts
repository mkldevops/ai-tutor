import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { backlogLine } from "#/components/programme-report";
import { PROGRAMME_BY_YEAR, programmeSteps } from "#/curriculum/programme";
import type { EvidenceMode } from "#/domain/types";
import { currentItem } from "#/learning-engine/lesson";
import { createMemoryStore } from "../store/memory-store";
import type { DataStore } from "../store/types";
import { type Actor, createFamilyForUser, createStudent } from "./family";
import { answerSession, continueSession, type SessionResponse, startSession } from "./learning";
import { openLegacySession, placeAt } from "./programme-fixtures";
import { getProgrammeReport } from "./programme-report";

const DAY = 86_400_000;
const CODE = "MA-Y3-AS-MENTAL";
const y3 = programmeSteps(3).map((s) => s.objectiveCode);
const learner = { yearGroup: 3 as const, preferences: { readingSupport: false, theme: "calm" as const } };

async function complete(store: DataStore, actor: Actor, studentId: string, kind: "lesson" | "review", wrong = 0) {
	if (kind === "lesson") await placeAt(store, studentId, CODE);
	let res: SessionResponse = await startSession({ store }, actor, { studentId, objectiveCode: CODE, kind });
	let wrongLeft = wrong;
	while (res.view.phase !== "complete") {
		if (res.view.phase === "instruction") {
			res = await continueSession({ store }, actor, res.sessionId);
			continue;
		}
		const session = await store.learning_sessions.get(res.sessionId);
		const item = currentItem(session?.state as NonNullable<typeof session>["state"]);
		const answer = wrongLeft-- > 0 ? "999999" : (item?.answer ?? "");
		res = await answerSession({ store }, actor, res.sessionId, answer);
	}
	return res;
}

describe("getProgrammeReport", () => {
	let store: DataStore;
	let alice: Actor;
	let bob: Actor;
	let sam: string;

	async function addSession(objectiveCode: string, mode: EvidenceMode, correct: number, open = false) {
		const session = await openLegacySession(store, sam, objectiveCode);
		const sessionId = session.id;
		for (let i = 0; i < 5; i++) {
			await store.assessment_attempts.create({
				familyId: alice.familyId,
				studentId: sam,
				objectiveCode,
				sessionId,
				mode,
				itemType: i % 2 === 0 ? "numeric" : "multiple_choice",
				prompt: "p",
				expected: "1",
				response: i < correct ? "1" : "2",
				correct: i < correct,
				hintsUsed: 0,
			});
			vi.advanceTimersByTime(1000);
		}
		if (!open) await store.learning_sessions.update(sessionId, { completedAt: new Date().toISOString() });
	}

	beforeEach(async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2026-11-01T12:00:00.000Z"));
		store = createMemoryStore();
		alice = await createFamilyForUser(store, "user-alice", "Alice family");
		bob = await createFamilyForUser(store, "user-bob", "Bob family");
		sam = (await createStudent(store, alice, { displayName: "Sam", ...learner })).id;
	});

	afterEach(() => vi.useRealTimers());

	it("keeps another family out", async () => {
		await expect(getProgrammeReport({ store }, bob, sam)).rejects.toMatchObject({ code: "not_found" });
	});

	it("does not leak another family's evidence into the report", async () => {
		const bobKid = (await createStudent(store, bob, { displayName: "Kim", ...learner })).id;
		await placeAt(store, bobKid, CODE);
		const r = await getProgrammeReport({ store }, alice, sam);
		expect(r.position.done).toBe(0);
		expect(r.acquired).toEqual([]);
		expect(r.lastActivityAt).toBeNull();
	});

	it("starts a new learner at unit 1, step 1 with the next three steps", async () => {
		const r = await getProgrammeReport({ store }, alice, sam);
		expect(r.position.unit).toMatchObject({ id: "Y3-U1", number: 1 });
		expect(r.position.step).toMatchObject({ code: y3[0], number: 1, total: y3.length });
		expect(r.position.progress).toEqual({ passed: 0, total: y3.length, rate: 0 });
		expect(r.position).toMatchObject({ stuck: false, complete: false, failedAssessments: 0 });
		expect(r.next.map((s) => s.code)).toEqual(y3.slice(0, 3));
		expect(r.acquired).toEqual([]);
		expect(r.toRework).toEqual([]);
		expect(r.passRate).toEqual({ passed: 0, total: 0, rate: null });
		expect(r.missionsLast7Days).toBe(0);
		expect(r.reviewBacklog).toEqual({ due: 0, deferred: 0 });
		expect(r.truncated).toBe(false);
	});

	it("reports acquired steps with their date and the position after them", async () => {
		await placeAt(store, sam, CODE);
		const first = (await store.student_competencies.listAll({ studentId: sam, objectiveCode: y3[0] as string }))[0];
		await store.student_competencies.update(first?.id as string, { securedAt: "2026-10-20T10:00:00.000Z" });

		const r = await getProgrammeReport({ store }, alice, sam);
		expect(r.acquired.map((s) => s.code)).toEqual(y3.slice(0, 6));
		expect(r.acquired[0]?.securedAt).toBe("2026-10-20T10:00:00.000Z");
		expect(r.acquired[1]?.securedAt).toBeNull();
		expect(r.position.unit).toMatchObject({ id: "Y3-U4", title: "Addition and subtraction", number: 4 });
		expect(r.position.step).toMatchObject({ code: CODE, number: 7 });
		expect(r.units.map((u) => [u.id, u.done, u.total, u.current])).toEqual(
			PROGRAMME_BY_YEAR[3].map((u, i) => [u.id, i < 3 ? u.objectiveCodes.length : 0, u.objectiveCodes.length, i === 3]),
		);
		expect(r.position.done).toBe(6);
		expect(r.next.map((s) => s.code)).toEqual(y3.slice(6, 9));
	});

	it("flags the current step as stuck after two failed independent assessments, and clears it on a pass", async () => {
		await placeAt(store, sam, CODE);
		await addSession(CODE, "guided", 1);
		await addSession(CODE, "independent", 2);
		await addSession(CODE, "independent", 3);

		const stuck = await getProgrammeReport({ store }, alice, sam);
		expect(stuck.position).toMatchObject({ stuck: true, failedAssessments: 2 });
		expect(stuck.toRework).toEqual([expect.objectContaining({ code: CODE, reasons: ["stuck"], failedAssessments: 2 })]);

		await addSession(CODE, "independent", 5);
		const passed = await getProgrammeReport({ store }, alice, sam);
		expect(passed.position).toMatchObject({ stuck: false, failedAssessments: 0 });
		expect(passed.toRework).toEqual([]);
	});

	it("ignores an unfinished assessment when counting failures", async () => {
		await placeAt(store, sam, CODE);
		await addSession(CODE, "independent", 2);
		await addSession(CODE, "independent", 0, true);

		const r = await getProgrammeReport({ store }, alice, sam);
		expect(r.position).toMatchObject({ stuck: false, failedAssessments: 1 });
		expect(r.toRework).toEqual([]);
	});

	it("lists a slipped step once with needs_review, regression and overdue review, and gates small rates", async () => {
		const lesson = await complete(store, alice, sam, "lesson");
		vi.setSystemTime(Date.parse(lesson.result?.nextReviewAt ?? ""));
		const first = await complete(store, alice, sam, "review");
		vi.setSystemTime(Date.parse(first.result?.nextReviewAt ?? ""));
		const second = await complete(store, alice, sam, "review", 99);
		expect(second.result?.status).toBe("needs_review");
		const now = new Date(Date.parse(second.result?.nextReviewAt ?? "") + 4 * DAY);

		const r = await getProgrammeReport({ store, now: () => now }, alice, sam);
		expect(r.toRework).toEqual([
			expect.objectContaining({
				code: CODE,
				reasons: ["needs_review", "regression", "overdue_review"],
				regressions: 1,
				daysOverdue: 4,
			}),
		]);
		expect(r.position.step?.code).toBe(y3[7]);
		expect(r.passRate).toEqual({ passed: 1, total: 2, rate: null });
	});

	it("counts missions completed in the last 7 days and the last activity", async () => {
		await complete(store, alice, sam, "lesson");
		const lastAttempt = (await store.assessment_attempts.listAll({ studentId: sam })).at(-1)?.createdAt;

		const soon = await getProgrammeReport({ store, now: () => new Date(Date.now() + DAY) }, alice, sam);
		expect(soon.missionsLast7Days).toBe(1);
		expect(soon.lastActivityAt).toBe(lastAttempt);

		const later = await getProgrammeReport({ store, now: () => new Date(Date.now() + 8 * DAY) }, alice, sam);
		expect(later.missionsLast7Days).toBe(0);
	});

	it.each([
		[1, 0],
		[3, 1],
		[6, 4],
	])("surfaces %i due reviews with %i beyond the cap", async (due, deferred) => {
		await placeAt(store, sam, y3[6] as string);
		for (let i = 0; i < due; i++) {
			await store.revision_schedules.create({
				familyId: alice.familyId,
				studentId: sam,
				objectiveCode: y3[i] as string,
				dueAt: new Date(Date.now() - (i + 1) * DAY).toISOString(),
				status: "pending",
			});
		}
		await store.revision_schedules.create({
			familyId: alice.familyId,
			studentId: sam,
			objectiveCode: y3[6] as string,
			dueAt: new Date(Date.now() + DAY).toISOString(),
			status: "pending",
		});
		const r = await getProgrammeReport({ store }, alice, sam);
		expect(r.reviewBacklog).toEqual({ due, deferred });
		expect(backlogLine(r) === null).toBe(deferred === 0);
	});

	it("defers every due review right after two reviews in a row", async () => {
		await placeAt(store, sam, y3[6] as string);
		for (let i = 0; i < 3; i++) {
			await store.revision_schedules.create({
				familyId: alice.familyId,
				studentId: sam,
				objectiveCode: y3[i] as string,
				dueAt: new Date(Date.now() - (i + 1) * DAY).toISOString(),
				status: "pending",
			});
		}
		for (const code of [y3[3], y3[4]]) {
			const done = await openLegacySession(store, sam, code as string);
			vi.advanceTimersByTime(1000);
			await store.learning_sessions.update(done.id, { kind: "review", completedAt: new Date().toISOString() });
		}
		const r = await getProgrammeReport({ store }, alice, sam);
		expect(r.reviewBacklog).toEqual({ due: 3, deferred: 3 });
		expect(backlogLine(r)).toBe(
			"3 reviews due. Nova spaces reviews between new steps, so 3 reviews wait for a later mission.",
		);
	});
});
