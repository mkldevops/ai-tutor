import { describe, expect, it } from "vitest";
import { learningOutcomes } from "./outcomes";

const session = (
	id: string,
	kind: "lesson" | "review",
	confidence: { before?: number; after?: number } | null,
	completedAt: string | null = "2026-11-10T10:00:00.000Z",
) => ({ id, objectiveCode: "OBJ", kind, completedAt, confidence });

const answers = (sessionId: string, mode: "guided" | "independent" | "review", right: number, wrong: number) => [
	...Array.from({ length: right }, () => ({ sessionId, mode, correct: true })),
	...Array.from({ length: wrong }, () => ({ sessionId, mode, correct: false })),
];

describe("learningOutcomes", () => {
	it("counts delayed reviews that held at the review threshold", () => {
		const o = learningOutcomes(
			[session("r1", "review", null), session("r2", "review", null), session("r3", "review", null, null)],
			[...answers("r1", "review", 4, 0), ...answers("r2", "review", 2, 2), ...answers("r3", "review", 4, 0)],
		);
		expect(o.reviews).toEqual({ completed: 2, held: 1, accuracy: 0.75 });
	});

	it("compares the child's confidence with unaided results only", () => {
		const o = learningOutcomes(
			[
				session("a", "lesson", { before: 2, after: 5 }, "2026-11-01T10:00:00.000Z"),
				session("b", "lesson", { before: 1 }, "2026-11-02T10:00:00.000Z"),
				session("c", "lesson", { after: 4 }, "2026-11-03T10:00:00.000Z"),
				session("d", "lesson", null),
			],
			[
				...answers("a", "guided", 5, 0),
				...answers("a", "independent", 2, 3),
				...answers("b", "independent", 5, 0),
				...answers("c", "independent", 4, 1),
				...answers("d", "independent", 5, 0),
			],
		);
		expect(o.confidence.checks.map((c) => [c.sessionId, c.calibration])).toEqual([
			["c", "matches"],
			["b", "under"],
			["a", "over"],
		]);
		expect(o.confidence).toMatchObject({ matches: 1, over: 1, under: 1 });
		expect(o.reviews).toEqual({ completed: 0, held: 0, accuracy: null });
	});

	it("keeps an exact 20-point gap in the matched bucket", () => {
		const o = learningOutcomes([session("e", "lesson", { after: 4 })], answers("e", "independent", 3, 2));
		expect(o.confidence.checks[0]?.calibration).toBe("matches");
	});
});
