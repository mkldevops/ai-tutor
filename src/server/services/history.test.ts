import { describe, expect, it } from "vitest";
import { objectiveHistory } from "./history";

const now = new Date("2026-11-17T12:00:00.000Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000).toISOString();

describe("objectiveHistory", () => {
	it("buckets answers into weeks, oldest first, and ignores older or future attempts", () => {
		const h = objectiveHistory(
			[
				{ createdAt: daysAgo(1), correct: true },
				{ createdAt: daysAgo(2), correct: false },
				{ createdAt: daysAgo(8), correct: true },
				{ createdAt: daysAgo(41), correct: true },
				{ createdAt: daysAgo(43), correct: true },
				{ createdAt: daysAgo(-1), correct: true },
			],
			[],
			now,
		);
		expect(h.weeks).toHaveLength(6);
		expect(h.weeks.map((w) => w.answers)).toEqual([1, 0, 0, 0, 1, 2]);
		expect(h.weeks[5]).toMatchObject({ answers: 2, correct: 1 });
		expect(h.weeks[0].start).toBe(daysAgo(42));
	});

	it("lists status changes in chronological order", () => {
		const h = objectiveHistory(
			[],
			[
				{ createdAt: daysAgo(1), fromStatus: "developing", toStatus: "secure", actor: "system", reason: "r2" },
				{ createdAt: daysAgo(5), fromStatus: "emerging", toStatus: "developing", actor: "system", reason: "r1" },
			],
			now,
		);
		expect(h.changes.map((c) => c.toStatus)).toEqual(["developing", "secure"]);
		expect(h.changes[0].at).toBe(daysAgo(5));
	});
});
