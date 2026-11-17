import { describe, expect, it } from "vitest";
import { nextReviewDate, reviewIntervalDays } from "./scheduling";

describe("review intervals", () => {
	it("grows after each successful review and stops at the longest step", () => {
		expect([0, 1, 2, 3, 4, 9].map((n) => reviewIntervalDays("secure", n))).toEqual([7, 14, 30, 60, 60, 60]);
		expect([0, 1, 2, 3].map((n) => reviewIntervalDays("mastered", n))).toEqual([30, 60, 120, 120]);
	});

	it("keeps short fixed intervals for objectives that still need work", () => {
		expect(reviewIntervalDays("needs_review", 3)).toBe(2);
		expect(reviewIntervalDays("not_started", 0)).toBeNull();
	});

	it("dates the next review from the given day", () => {
		const from = new Date("2026-11-17T12:00:00.000Z");
		expect(nextReviewDate("secure", from, 1)?.toISOString()).toBe("2026-12-01T12:00:00.000Z");
		expect(nextReviewDate("secure", from)?.toISOString()).toBe("2026-11-24T12:00:00.000Z");
	});
});
