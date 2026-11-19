import { describe, expect, it } from "vitest";
import type { EvidenceMode, ItemType } from "#/domain/types";
import {
	isRegression,
	learnerLongitudinal,
	type ObjectiveEvent,
	objectiveLongitudinal,
	type PendingReview,
	rate,
} from "./longitudinal";
import type { EvidenceAttempt } from "./mastery";

const TYPES: ItemType[] = ["numeric", "multiple_choice"];
const NOW = new Date("2026-04-01T12:00:00.000Z");

const day = (n: number) => new Date(Date.parse("2026-01-01T10:00:00.000Z") + n * 86_400_000).toISOString();

function session(id: string, mode: EvidenceMode, right: number, wrong: number, at: string): EvidenceAttempt[] {
	return [...Array(right).fill(true), ...Array(wrong).fill(false)].map((correct, i) => ({
		sessionId: id,
		mode,
		itemType: TYPES[i % TYPES.length] as ItemType,
		correct,
		hintsUsed: 0,
		createdAt: at,
	}));
}

const lesson = (id: string, at: string) => session(id, "independent", 6, 0, at);
const held = (id: string, at: string) => session(id, "review", 4, 0, at);
const slipped = (id: string, at: string) => session(id, "review", 1, 3, at);

const event = (createdAt: string, fromStatus: string, toStatus: string, actor: "system" | "parent" = "system") =>
	({ createdAt, fromStatus, toStatus, actor }) as ObjectiveEvent;

function build(attempts: EvidenceAttempt[], events: ObjectiveEvent[] = [], pending: PendingReview[] = []) {
	return objectiveLongitudinal({ objectiveCode: "OBJ", attempts, events, pending, now: NOW });
}

describe("rate", () => {
	it("withholds a percentage below the minimum sample", () => {
		expect(rate(3, 4)).toEqual({ passed: 3, total: 4, rate: null });
		expect(rate(4, 5)).toEqual({ passed: 4, total: 5, rate: 0.8 });
		expect(rate(0, 0, 0)).toEqual({ passed: 0, total: 0, rate: null });
	});
});

describe("objectiveLongitudinal", () => {
	it("reports nothing to measure without reviews", () => {
		const o = build(lesson("l1", day(0)));
		expect(o.status).toBe("secure");
		expect(o.reviews).toEqual([]);
		expect(o.unscoredReviews).toBe(0);
		expect(o.passRate).toEqual({ passed: 0, total: 0, rate: null });
		expect(o.retention).toEqual([
			{ passed: 0, total: 0, rate: null },
			{ passed: 0, total: 0, rate: null },
			{ passed: 0, total: 0, rate: null },
		]);
		expect(o.securedAt).toBe(day(0));
		expect(o.masteredAt).toBeNull();
		expect(o.daysSinceSecured).toBe(90);
		expect(o.nextReview).toBeNull();
	});

	it("reports nothing at all for an objective never started", () => {
		const o = build([]);
		expect(o).toMatchObject({ status: "not_started", securedAt: null, daysSinceSecured: null, regressions: 0 });
	});

	it("numbers spaced reviews since mastery and tracks whether each one held", () => {
		const o = build([...lesson("l1", day(0)), ...held("r1", day(7)), ...held("r2", day(37)), ...held("r3", day(97))]);
		expect(o.reviews.map((r) => [r.ordinal, r.held, r.daysAfterSecured])).toEqual([
			[1, true, 7],
			[2, true, 37],
			[3, true, 97],
		]);
		expect(o.retention.map((r) => [r.passed, r.total])).toEqual([
			[1, 1],
			[1, 1],
			[1, 1],
		]);
		expect(o.passRate).toEqual({ passed: 3, total: 3, rate: null });
		expect(o.masteredAt).toBe(day(7));
		expect(o.status).toBe("mastered");
	});

	it("handles every review failing: no mastery, restarts numbering after re-securing", () => {
		const o = build(
			[
				...lesson("l1", day(0)),
				...slipped("r1", day(7)),
				...lesson("l2", day(10)),
				...slipped("r2", day(17)),
				...lesson("l3", day(20)),
				...slipped("r3", day(30)),
			],
			[
				event(day(0), "not_started", "secure"),
				event(day(7), "secure", "needs_review"),
				event(day(10), "needs_review", "secure"),
				event(day(17), "secure", "needs_review"),
				event(day(20), "needs_review", "secure"),
				event(day(30), "secure", "needs_review"),
			],
		);
		expect(o.reviews.map((r) => [r.ordinal, r.held])).toEqual([
			[1, false],
			[1, false],
			[1, false],
		]);
		expect(o.retention[0]).toEqual({ passed: 0, total: 3, rate: null });
		expect(o.retention[1]?.total).toBe(0);
		expect(o.status).toBe("needs_review");
		expect(o.securedAt).toBeNull();
		expect(o.masteredAt).toBeNull();
		expect(o.regressions).toBe(3);
		expect(o.lastRegressionAt).toBe(day(30));
	});

	it("counts a slip after mastery as a regression and reports the second review as not held", () => {
		const o = build(
			[...lesson("l1", day(0)), ...held("r1", day(7)), ...slipped("r2", day(40)), ...lesson("l2", day(45))],
			[
				event(day(0), "not_started", "secure"),
				event(day(7), "secure", "mastered"),
				event(day(40), "mastered", "needs_review"),
				event(day(45), "needs_review", "secure"),
			],
		);
		expect(o.retention.map((r) => [r.passed, r.total])).toEqual([
			[1, 1],
			[0, 1],
			[0, 0],
		]);
		expect(o.regressions).toBe(1);
		expect(o.status).toBe("secure");
		expect(o.securedAt).toBe(day(45));
		expect(o.masteredAt).toBeNull();
	});

	it("does not count early reviews or reviews before securing as spaced reviews", () => {
		const o = build([...held("r0", day(0)), ...lesson("l1", day(1)), ...held("r1", day(3))]);
		expect(o.reviews).toEqual([]);
		expect(o.unscoredReviews).toBe(2);
		expect(o.status).toBe("secure");
	});

	it("ignores parent overrides when counting regressions", () => {
		const o = build(lesson("l1", day(0)), [
			event(day(1), "secure", "developing", "parent"),
			event(day(2), "developing", "needs_review"),
		]);
		expect(o.regressions).toBe(0);
	});

	it("flags a pending review as overdue once it is a full day late", () => {
		const late = build(lesson("l1", day(0)), [], [{ dueAt: "2026-03-29T12:00:00.000Z" }]);
		expect(late.nextReview).toEqual({ dueAt: "2026-03-29T12:00:00.000Z", daysOverdue: 3, overdue: true });
		const today = build(lesson("l1", day(0)), [], [{ dueAt: "2026-04-01T06:00:00.000Z" }]);
		expect(today.nextReview).toMatchObject({ daysOverdue: 0, overdue: false });
		const later = build(lesson("l1", day(0)), [], [{ dueAt: "2026-04-08T12:00:00.000Z" }]);
		expect(later.nextReview).toMatchObject({ daysOverdue: 0, overdue: false });
	});
});

describe("isRegression", () => {
	it("only counts system drops from secure or mastered", () => {
		expect(isRegression(event(day(0), "mastered", "needs_review"))).toBe(true);
		expect(isRegression(event(day(0), "secure", "needs_review"))).toBe(true);
		expect(isRegression(event(day(0), "developing", "emerging"))).toBe(false);
		expect(isRegression(event(day(0), "secure", "mastered"))).toBe(false);
	});
});

describe("learnerLongitudinal", () => {
	it("pools reviews across objectives and only shows a rate once the sample is large enough", () => {
		const a = build([...lesson("a1", day(0)), ...held("a2", day(7)), ...held("a3", day(37))]);
		const b = build([...lesson("b1", day(0)), ...held("b2", day(8)), ...slipped("b3", day(40))]);
		const c = build([...lesson("c1", day(0)), ...held("c2", day(9))], [], [{ dueAt: day(30) }]);
		const l = learnerLongitudinal([a, b, c]);
		expect(l.passRate).toEqual({ passed: 4, total: 5, rate: 0.8 });
		expect(l.retention.map((r) => [r.passed, r.total, r.rate])).toEqual([
			[3, 3, null],
			[1, 2, null],
			[0, 0, null],
		]);
		expect(l.overdueReviews).toBe(1);
		expect(l.securedNow).toBe(2);
	});

	it("is empty for a learner with no objectives", () => {
		expect(learnerLongitudinal([])).toMatchObject({
			passRate: { passed: 0, total: 0, rate: null },
			regressions: 0,
			overdueReviews: 0,
			securedNow: 0,
		});
	});
});
