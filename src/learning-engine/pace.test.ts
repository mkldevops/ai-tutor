import { describe, expect, it } from "vitest";
import {
	countMissions,
	DEFAULT_MISSIONS_PER_STEP,
	expectedMissions,
	missionsPerStep,
	type PaceInput,
	type PaceSession,
	projectEnd,
	projectPace,
} from "./pace";

const NOW = new Date("2026-11-22T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const lesson = (days: number): PaceSession => ({ kind: "lesson", completedAt: daysAgo(days) });

const input = (over: Partial<PaceInput> = {}): PaceInput => ({
	target: 4,
	paused: false,
	sessions: [],
	stepsRemaining: 10,
	stepsDone: 4,
	startedAt: daysAgo(60),
	now: NOW,
	...over,
});

describe("countMissions", () => {
	it("counts completed course sessions in the last 7 days only", () => {
		const sessions: PaceSession[] = [
			lesson(1),
			{ kind: "review", completedAt: daysAgo(6.9) },
			{ kind: "extra", completedAt: daysAgo(1) },
			{ kind: "lesson", completedAt: null },
			lesson(7),
			lesson(8),
			{ kind: "lesson", completedAt: new Date(NOW.getTime() + 60_000).toISOString() },
		];
		expect(countMissions(sessions, NOW)).toBe(2);
	});
});

describe("missionsPerStep", () => {
	it("falls back to the default before any step is done", () => {
		expect(missionsPerStep([lesson(1)], 0)).toBe(DEFAULT_MISSIONS_PER_STEP);
		expect(missionsPerStep([], 3)).toBe(DEFAULT_MISSIONS_PER_STEP);
	});

	it("uses observed missions per secured step, never below one", () => {
		expect(missionsPerStep([lesson(1), lesson(2), lesson(3), { kind: "extra", completedAt: daysAgo(1) }], 2)).toBe(1.5);
		expect(missionsPerStep([lesson(1)], 4)).toBe(1);
	});
});

describe("expectedMissions", () => {
	it("prorates the target for a profile younger than a week", () => {
		expect(expectedMissions(4, daysAgo(0), NOW)).toBe(0);
		expect(expectedMissions(4, daysAgo(1), NOW)).toBe(0);
		expect(expectedMissions(4, daysAgo(3.5), NOW)).toBe(2);
		expect(expectedMissions(4, daysAgo(30), NOW)).toBe(4);
	});
});

describe("projectEnd", () => {
	it("projects remaining missions at the weekly rate, at day precision", () => {
		expect(projectEnd(10, 2, 4, NOW)).toBe("2026-12-27T00:00:00.000Z");
		expect(projectEnd(1, 1, 7, NOW)).toBe("2026-11-23T00:00:00.000Z");
	});

	it("returns no date when nothing remains or the rate is zero", () => {
		expect(projectEnd(0, 2, 4, NOW)).toBeNull();
		expect(projectEnd(5, 2, 0, NOW)).toBeNull();
	});
});

describe("projectPace", () => {
	it("is on track exactly at the target", () => {
		const pace = projectPace(input({ sessions: [lesson(1), lesson(2), lesson(3), lesson(4)] }));
		expect(pace).toMatchObject({ status: "on_track", missionsThisWeek: 4, basis: "observed" });
	});

	it("is behind one mission under the target and projects at the observed pace", () => {
		const sessions = [lesson(1), lesson(2), lesson(3), lesson(20), lesson(21), lesson(22), lesson(23), lesson(24)];
		const pace = projectPace(input({ sessions, stepsDone: 4, stepsRemaining: 6 }));
		expect(pace.status).toBe("behind");
		expect(pace.missionsPerStep).toBe(2);
		expect(pace.projectedEndAt).toBe("2026-12-20T00:00:00.000Z");
	});

	it("projects at the target, labelled as such, when no mission was done this week", () => {
		const pace = projectPace(input({ sessions: [lesson(30)], stepsDone: 1, stepsRemaining: 4 }));
		expect(pace).toMatchObject({ status: "behind", basis: "target", projectedEndAt: "2026-11-29T00:00:00.000Z" });
	});

	it("is not behind on the first day of a new profile", () => {
		const pace = projectPace(input({ startedAt: daysAgo(0.2), stepsDone: 0, stepsRemaining: 14 }));
		expect(pace.status).toBe("on_track");
		expect(pace.basis).toBe("target");
	});

	it("never reports behind or a date while the programme is paused", () => {
		const pace = projectPace(input({ paused: true }));
		expect(pace).toMatchObject({ status: "paused", projectedEndAt: null, basis: null });
	});

	it("has no projection once the programme is complete", () => {
		const pace = projectPace(input({ stepsRemaining: 0, stepsDone: 14, paused: true }));
		expect(pace).toMatchObject({ status: "complete", projectedEndAt: null, basis: null });
	});

	it("moves the projected date closer as the weekly pace rises", () => {
		const slow = projectPace(input({ sessions: [lesson(1)] }));
		const fast = projectPace(input({ sessions: [lesson(1), lesson(2), lesson(3), lesson(4), lesson(5)] }));
		expect(Date.parse(fast.projectedEndAt ?? "")).toBeLessThan(Date.parse(slow.projectedEndAt ?? ""));
	});
});
