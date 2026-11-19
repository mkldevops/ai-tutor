import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { currentItem } from "#/learning-engine/lesson";
import { createMemoryStore } from "../store/memory-store";
import type { DataStore } from "../store/types";
import { type Actor, createFamilyForUser, createStudent } from "./family";
import { answerSession, continueSession, type SessionResponse, startSession } from "./learning";
import { getStudentOutcomes } from "./longitudinal";

const DAY = 86_400_000;
const CODE = "MA-Y3-AS-MENTAL";

async function complete(store: DataStore, actor: Actor, studentId: string, kind: "lesson" | "review", wrong = 0) {
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

const learner = { yearGroup: 3 as const, preferences: { readingSupport: false, theme: "calm" as const } };

describe("getStudentOutcomes", () => {
	let store: DataStore;
	let alice: Actor;
	let bob: Actor;
	let sam: string;

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
		await expect(getStudentOutcomes({ store }, bob, sam)).rejects.toMatchObject({ code: "not_found" });
	});

	it("is empty before any mission", async () => {
		const o = await getStudentOutcomes({ store }, alice, sam);
		expect(o.objectives).toEqual([]);
		expect(o.passRate).toEqual({ passed: 0, total: 0, rate: null });
	});

	it("follows a held review, a slip and an overdue review from stored evidence", async () => {
		const lesson = await complete(store, alice, sam, "lesson");
		vi.setSystemTime(Date.parse(lesson.result?.nextReviewAt ?? ""));
		const first = await complete(store, alice, sam, "review");
		expect(first.result?.status).toBe("mastered");
		vi.setSystemTime(Date.parse(first.result?.nextReviewAt ?? ""));
		const second = await complete(store, alice, sam, "review", 99);
		expect(second.result?.status).toBe("needs_review");
		const dueAt = second.result?.nextReviewAt ?? "";
		const now = new Date(Date.parse(dueAt) + 4 * DAY);

		const o = await getStudentOutcomes({ store, now: () => now }, alice, sam);
		const obj = o.objectives.find((x) => x.objectiveCode === CODE);
		expect(obj?.reviews.map((r) => [r.ordinal, r.held])).toEqual([
			[1, true],
			[2, false],
		]);
		expect(obj).toMatchObject({ status: "needs_review", securedAt: null, regressions: 1 });
		expect(obj?.nextReview).toMatchObject({ dueAt, daysOverdue: 4, overdue: true });
		expect(o.passRate).toEqual({ passed: 1, total: 2, rate: null });
		expect(o.overdueReviews).toBe(1);
		expect(o.regressions).toBe(1);
	});
});
