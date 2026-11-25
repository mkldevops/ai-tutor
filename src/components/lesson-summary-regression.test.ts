import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { currentItem } from "#/learning-engine/lesson";
import { createFamilyForUser, createStudent } from "#/server/services/family";
import { answerSession, continueSession, getSession, overrideCompetency } from "#/server/services/learning";
import { openLegacySession } from "#/server/services/programme-fixtures";
import { createMemoryStore } from "#/server/store/memory-store";
import { LessonSummary } from "./lesson-support";

const CODE = "MA-Y3-AS-MENTAL";

async function fixture() {
	vi.useFakeTimers({ now: new Date("2026-11-25T10:00:00.000Z"), toFake: ["Date"] });
	const store = createMemoryStore();
	const actor = await createFamilyForUser(store, "summary-parent", "Summary family");
	const student = await createStudent(store, actor, {
		displayName: "Alex",
		yearGroup: 3,
		preferences: { readingSupport: false, theme: "calm" },
	});
	const open = () => openLegacySession(store, student.id, CODE);
	const complete = async (sessionId: string, correct: boolean) => {
		let response = await getSession({ store }, actor, sessionId);
		while (response.view.phase !== "complete") {
			if (response.view.phase === "instruction") {
				response = await continueSession({ store }, actor, sessionId);
				continue;
			}
			const stored = await store.learning_sessions.get(sessionId);
			if (!stored) throw new Error("Missing test session");
			const item = currentItem(stored.state);
			if (!item) throw new Error("Missing test question");
			response = await answerSession({ store }, actor, sessionId, correct ? item.answer : "incorrect");
		}
		return response;
	};
	const expectNeutralSummary = async (sessionId: string, status: "secure" | "mastered") => {
		const response = await complete(sessionId, false);
		const attempts = await store.assessment_attempts.listAll({ sessionId, mode: "independent" });
		expect(attempts.length).toBeGreaterThan(0);
		expect(attempts.every((attempt) => !attempt.correct)).toBe(true);
		expect(response.result?.status).toBe(status);
		if (!response.result) throw new Error("Missing completion result");
		const html = renderToStaticMarkup(
			createElement(LessonSummary, {
				title: response.objective.title,
				status: response.result.status,
			}),
		);
		expect(html).toContain("currently marked");
		expect(html).toContain(status === "secure" ? "Secure" : "Mastered");
		expect(html).toContain("can check what you remember");
		expect(html).not.toMatch(
			/answers met today's check goal|checks over time have met the course goal|passed|retained/,
		);
	};
	return { store, actor, student, open, complete, expectNeutralSummary };
}

afterEach(() => vi.useRealTimers());

describe("lesson summary with global status and failed current-session evidence", () => {
	it.each([
		"secure",
		"mastered",
	] as const)("does not turn a parent-forced %s status into a session success", async (status) => {
		const f = await fixture();
		const session = await f.open();
		await overrideCompetency({ store: f.store }, f.actor, {
			studentId: f.student.id,
			objectiveCode: CODE,
			status,
			reason: "Parent assessment outside this app",
		});
		await f.expectNeutralSummary(session.id, status);
		const [competency] = await f.store.student_competencies.listAll({ studentId: f.student.id, objectiveCode: CODE });
		expect(competency?.computedStatus).toBe("developing");
		expect(competency?.override?.status).toBe(status);
	});

	it("does not turn an earlier secure result into a success for the failed session", async () => {
		const f = await fixture();
		const previous = await f.open();
		expect((await f.complete(previous.id, true)).result?.status).toBe("secure");
		vi.setSystemTime(new Date("2026-11-25T11:00:00.000Z"));
		const current = await f.open();
		await f.expectNeutralSummary(current.id, "secure");
		const [competency] = await f.store.student_competencies.listAll({ studentId: f.student.id, objectiveCode: CODE });
		expect(competency?.computedStatus).toBe("secure");
		expect(competency?.override).toBeNull();
	});
});
