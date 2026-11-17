import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { currentItem } from "#/learning-engine/lesson";
import { createMemoryStore } from "../store/memory-store";
import type { DataStore } from "../store/types";
import { type Actor, createFamilyForUser, createStudent } from "./family";
import { answerSession, continueSession, type SessionResponse, startSession } from "./learning";

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

const daysUntil = (dueAt: string | null | undefined) => Math.round((Date.parse(dueAt ?? "") - Date.now()) / DAY);

describe("expanding review intervals", () => {
	let store: DataStore;
	let alice: Actor;
	let sam: string;

	beforeEach(async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2026-11-17T12:00:00.000Z"));
		store = createMemoryStore();
		alice = await createFamilyForUser(store, "user-alice", "Alice family");
		sam = (
			await createStudent(store, alice, {
				displayName: "Sam",
				yearGroup: 3,
				preferences: { readingSupport: false, theme: "calm" },
			})
		).id;
	});

	afterEach(() => vi.useRealTimers());

	async function reviewWhenDue(dueAt: string | null | undefined, wrong = 0) {
		vi.setSystemTime(Date.parse(dueAt ?? ""));
		const res = await complete(store, alice, sam, "review", wrong);
		return { status: res.result?.status, days: daysUntil(res.result?.nextReviewAt), dueAt: res.result?.nextReviewAt };
	}

	it("spaces each successful review further apart", async () => {
		const lesson = await complete(store, alice, sam, "lesson");
		expect(lesson.result?.status).toBe("secure");
		expect(daysUntil(lesson.result?.nextReviewAt)).toBe(7);
		const steps = [];
		let dueAt = lesson.result?.nextReviewAt;
		for (let i = 0; i < 4; i++) {
			const step = await reviewWhenDue(dueAt);
			steps.push({ status: step.status, days: step.days });
			dueAt = step.dueAt;
		}
		expect(steps).toEqual([
			{ status: "mastered", days: 30 },
			{ status: "mastered", days: 60 },
			{ status: "mastered", days: 120 },
			{ status: "mastered", days: 120 },
		]);
	});

	it("goes back to short intervals after a failed review", async () => {
		const lesson = await complete(store, alice, sam, "lesson");
		const first = await reviewWhenDue(lesson.result?.nextReviewAt);
		const second = await reviewWhenDue(first.dueAt);
		expect(second.days).toBe(60);
		const failed = await reviewWhenDue(second.dueAt, 99);
		expect(failed.status).not.toBe("mastered");
		expect(failed.days).toBeLessThanOrEqual(7);
	});
});
