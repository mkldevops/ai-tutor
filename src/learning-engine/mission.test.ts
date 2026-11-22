import { describe, expect, it } from "vitest";
import { programmeSteps } from "#/curriculum/programme";
import type { CompetencyStatus } from "#/domain/types";
import {
	type CompletedMission,
	deferredReviews,
	MAX_REVIEWS_BEFORE_LESSON,
	type MissionInput,
	type PendingReview,
	todaysMission,
} from "./mission";
import { programmePosition } from "./programme";

const sequence = programmeSteps(3);
const codes = sequence.map((s) => s.objectiveCode);
const NOW = new Date("2026-11-21T12:00:00.000Z");
const DAY = 86_400_000;
const daysFromNow = (d: number) => new Date(NOW.getTime() + d * DAY).toISOString();

function position(statuses: Record<number, CompetencyStatus> = {}) {
	return programmePosition(
		sequence,
		Object.entries(statuses).map(([i, status]) => ({ objectiveCode: codes[Number(i)] as string, status })),
	);
}

function mission(input: Partial<MissionInput> = {}) {
	return todaysMission({ position: position(), openSessions: [], pendingReviews: [], now: NOW, ...input });
}

describe("todaysMission", () => {
	it("resumes an open session before anything else", () => {
		expect(
			mission({
				position: position({ 0: "needs_review" }),
				openSessions: [{ id: "s1", objectiveCode: codes[3] as string, kind: "lesson", createdAt: daysFromNow(-1) }],
				pendingReviews: [{ objectiveCode: codes[0] as string, dueAt: daysFromNow(-2) }],
			}),
		).toEqual({ reason: "continue", objectiveCode: codes[3], sessionKind: "lesson", sessionId: "s1", dueAt: null });
	});

	it("resumes the most recent open session when several are open", () => {
		const m = mission({
			openSessions: [
				{ id: "old", objectiveCode: codes[0] as string, kind: "lesson", createdAt: daysFromNow(-3) },
				{ id: "new", objectiveCode: codes[2] as string, kind: "review", createdAt: daysFromNow(-1) },
			],
		});
		expect(m).toMatchObject({ reason: "continue", sessionId: "new", sessionKind: "review" });
	});

	it("takes the oldest due review before rework and the current step", () => {
		const m = mission({
			position: position({ 0: "needs_review", 1: "secure", 2: "secure" }),
			pendingReviews: [
				{ objectiveCode: codes[2] as string, dueAt: daysFromNow(-1) },
				{ objectiveCode: codes[1] as string, dueAt: daysFromNow(-4) },
				{ objectiveCode: codes[0] as string, dueAt: daysFromNow(1) },
			],
		});
		expect(m).toEqual({
			reason: "review",
			objectiveCode: codes[1],
			sessionKind: "review",
			sessionId: null,
			dueAt: daysFromNow(-4),
		});
	});

	it("breaks ties between reviews due at the same time by objective code", () => {
		const due = daysFromNow(-1);
		const m = mission({
			pendingReviews: [
				{ objectiveCode: "MA-Y3-PV-DIGIT-VALUE", dueAt: due },
				{ objectiveCode: "EN-Y3-GR-A-AN", dueAt: due },
			],
		});
		expect(m).toMatchObject({ reason: "review", objectiveCode: "EN-Y3-GR-A-AN" });
	});

	it("ignores reviews outside the learner's programme", () => {
		const m = mission({ pendingReviews: [{ objectiveCode: "MA-Y5-MD-PRIMES", dueAt: daysFromNow(-1) }] });
		expect(m).toMatchObject({ reason: "current", objectiveCode: codes[0] });
	});

	it("reworks a step that needs review before the current step", () => {
		const m = mission({
			position: position({ 0: "secure", 1: "needs_review", 2: "developing" }),
			pendingReviews: [{ objectiveCode: codes[1] as string, dueAt: daysFromNow(2) }],
		});
		expect(m).toEqual({
			reason: "rework",
			objectiveCode: codes[1],
			sessionKind: "lesson",
			sessionId: null,
			dueAt: null,
		});
	});

	it("gives the current step as a lesson when nothing else is pending", () => {
		const m = mission({ position: position({ 0: "secure", 1: "mastered" }) });
		expect(m).toEqual({
			reason: "current",
			objectiveCode: codes[2],
			sessionKind: "lesson",
			sessionId: null,
			dueAt: null,
		});
	});

	it("reworks a step even when every other step is done", () => {
		const statuses = Object.fromEntries(codes.map((_, i) => [i, i === 4 ? "needs_review" : "secure"]));
		const p = position(statuses as Record<number, CompetencyStatus>);
		expect(p.complete).toBe(true);
		expect(mission({ position: p })).toMatchObject({ reason: "rework", objectiveCode: codes[4] });
	});

	it("reports the programme complete with the next review date", () => {
		const all = position(Object.fromEntries(codes.map((_, i) => [i, "secure"])) as Record<number, CompetencyStatus>);
		expect(
			mission({
				position: all,
				pendingReviews: [
					{ objectiveCode: codes[5] as string, dueAt: daysFromNow(9) },
					{ objectiveCode: codes[2] as string, dueAt: daysFromNow(3) },
				],
			}),
		).toEqual({ reason: "complete", nextReviewAt: daysFromNow(3) });
		expect(mission({ position: all })).toEqual({ reason: "complete", nextReviewAt: null });
	});
});

describe("review interleaving", () => {
	const inProgress = position({ 0: "secure", 1: "secure", 2: "secure", 3: "secure", 4: "secure", 5: "secure" });

	function simulate(dueCount: number, missions: number, history: CompletedMission[] = []) {
		let pending: PendingReview[] = Array.from({ length: dueCount }, (_, i) => ({
			objectiveCode: codes[i] as string,
			dueAt: daysFromNow(-10 + i),
		}));
		const recent = [...history];
		const served: string[] = [];
		const deferred: number[] = [];
		for (let n = 0; n < missions; n++) {
			deferred.push(
				deferredReviews({ position: inProgress, pendingReviews: pending, recentMissions: recent, now: NOW }),
			);
			const m = mission({ position: inProgress, pendingReviews: pending, recentMissions: recent });
			if (m.reason === "complete" || m.reason === "continue") throw new Error(`unexpected ${m.reason}`);
			served.push(m.sessionKind === "review" ? `R:${codes.indexOf(m.objectiveCode)}` : "L");
			if (m.sessionKind === "review") pending = pending.filter((r) => r.objectiveCode !== m.objectiveCode);
			recent.push({
				kind: m.sessionKind,
				completedAt: new Date(NOW.getTime() - (missions - n) * 60_000).toISOString(),
			});
		}
		return { served, deferred };
	}

	const kinds = (served: string[]) => served.map((s) => s[0]).join("");

	it("serves the lesson straight away when no review is due", () => {
		expect(simulate(0, 3).served).toEqual(["L", "L", "L"]);
	});

	it("takes one due review before the lesson", () => {
		expect(simulate(1, 3).served).toEqual(["R:0", "L", "L"]);
	});

	it("caps three due reviews at two before the lesson, then alternates", () => {
		const { served, deferred } = simulate(3, 5);
		expect(served).toEqual(["R:0", "R:1", "L", "R:2", "L"]);
		expect(deferred[0]).toBe(1);
	});

	it("alternates six due reviews with lessons, oldest first", () => {
		const { served, deferred } = simulate(6, 10);
		expect(served).toEqual(["R:0", "R:1", "L", "R:2", "L", "R:3", "L", "R:4", "L", "R:5"]);
		expect(deferred[0]).toBe(6 - MAX_REVIEWS_BEFORE_LESSON);
	});

	it("never blocks new content for more than one mission after the first two reviews", () => {
		for (const due of [0, 1, 3, 6, 12]) {
			const k = kinds(simulate(due, 2 * due + 2).served);
			expect(k.slice(2)).not.toMatch(/RR/);
			expect(k.slice(0, 3)).not.toBe("RRR");
		}
	});

	it("resumes the cap from history: two reviews in a row force the lesson", () => {
		const history: CompletedMission[] = [
			{ kind: "review", completedAt: daysFromNow(-0.2) },
			{ kind: "review", completedAt: daysFromNow(-0.1) },
		];
		expect(simulate(2, 2, history).served).toEqual(["L", "R:0"]);
	});

	it("ignores other session kinds when counting reviews in a row", () => {
		const history: CompletedMission[] = [
			{ kind: "review", completedAt: daysFromNow(-0.3) },
			{ kind: "extra", completedAt: daysFromNow(-0.2) },
			{ kind: "review", completedAt: daysFromNow(-0.1) },
		];
		expect(simulate(1, 1, history).served).toEqual(["L"]);
	});

	it("keeps serving reviews past the cap when no lesson is left", () => {
		const all = position(Object.fromEntries(codes.map((_, i) => [i, "secure"])) as Record<number, CompetencyStatus>);
		const recent: CompletedMission[] = [
			{ kind: "review", completedAt: daysFromNow(-0.2) },
			{ kind: "review", completedAt: daysFromNow(-0.1) },
		];
		const pendingReviews = [{ objectiveCode: codes[0] as string, dueAt: daysFromNow(-1) }];
		expect(mission({ position: all, pendingReviews, recentMissions: recent })).toMatchObject({ reason: "review" });
		expect(deferredReviews({ position: all, pendingReviews, recentMissions: recent, now: NOW })).toBe(0);
	});
});
