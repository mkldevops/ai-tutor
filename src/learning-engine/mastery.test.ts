import { describe, expect, it } from "vitest";
import type { EvidenceMode, ItemType } from "#/domain/types";
import { type EvidenceAttempt, evaluateMastery } from "./mastery";

const TYPES: ItemType[] = ["numeric", "multiple_choice", "missing_number", "word_problem"];

function session(
	id: string,
	mode: EvidenceMode,
	results: boolean[],
	at: string,
	opts: { hints?: number; types?: ItemType[] } = {},
): EvidenceAttempt[] {
	const types = opts.types ?? TYPES;
	return results.map((correct, i) => ({
		sessionId: id,
		mode,
		itemType: types[i % types.length] as ItemType,
		correct,
		hintsUsed: i === 0 ? (opts.hints ?? 0) : 0,
		createdAt: at,
	}));
}

const ALL = (n: number) => Array(n).fill(true);
const D0 = "2026-01-01T10:00:00.000Z";
const D1 = "2026-01-01T10:20:00.000Z";
const D9 = "2026-01-10T10:00:00.000Z";
const D3 = "2026-01-04T10:00:00.000Z";

describe("evaluateMastery", () => {
	it("is not_started without evidence", () => {
		expect(evaluateMastery([]).status).toBe("not_started");
	});

	it("never confers mastery from guided practice alone, even when perfect", () => {
		const d = evaluateMastery(session("s1", "guided", ALL(20), D0));
		expect(d.status).toBe("developing");
		expect(d.status).not.toBe("mastered");
		expect(d.status).not.toBe("secure");
	});

	it("stays emerging when guided accuracy is low", () => {
		expect(evaluateMastery(session("s1", "guided", [true, false, false, false], D0)).status).toBe("emerging");
	});

	it("marks secure (not mastered) after a strong independent assessment", () => {
		const d = evaluateMastery([
			...session("s1", "guided", ALL(5), D0),
			...session("s1", "independent", [true, true, true, true, true, false], D1),
		]);
		expect(d.status).toBe("secure");
		expect(d.securedAt).toBe(D1);
	});

	it("rejects independent assessment with a single question type", () => {
		const d = evaluateMastery(session("s1", "independent", ALL(6), D1, { types: ["numeric"] }));
		expect(d.status).toBe("developing");
	});

	it("rejects independent assessment with too few items", () => {
		expect(evaluateMastery(session("s1", "independent", ALL(4), D1)).status).toBe("developing");
	});

	it("rejects independent assessment below accuracy threshold", () => {
		expect(evaluateMastery(session("s1", "independent", [true, true, true, true, false, false], D1)).status).toBe(
			"developing",
		);
	});

	it("rejects independent evidence if hints were used", () => {
		expect(evaluateMastery(session("s1", "independent", ALL(6), D1, { hints: 1 })).status).toBe("developing");
	});

	it("requires a delayed review to reach mastered", () => {
		const d = evaluateMastery([...session("s1", "independent", ALL(6), D1), ...session("s2", "review", ALL(4), D9)]);
		expect(d.status).toBe("mastered");
	});

	it("ignores a review taken too soon", () => {
		const d = evaluateMastery([...session("s1", "independent", ALL(6), D1), ...session("s2", "review", ALL(4), D3)]);
		expect(d.status).toBe("secure");
	});

	it("drops to needs_review when delayed review fails", () => {
		const d = evaluateMastery([
			...session("s1", "independent", ALL(6), D1),
			...session("s2", "review", [true, false, false, true], D9),
		]);
		expect(d.status).toBe("needs_review");
		expect(d.securedAt).toBeNull();
	});

	it("ignores review without prior secure assessment", () => {
		const d = evaluateMastery(session("s2", "review", ALL(4), D9));
		expect(d.status).toBe("emerging");
	});

	it("respects configurable thresholds", () => {
		const attempts = session("s1", "independent", [true, true, true, false, false], D1);
		expect(evaluateMastery(attempts).status).toBe("developing");
		expect(
			evaluateMastery(attempts, {
				independentMinItems: 5,
				independentMinAccuracy: 0.6,
				independentMinItemTypes: 2,
				guidedDevelopingAccuracy: 0.7,
				reviewMinDelayDays: 7,
				reviewMinItems: 4,
				reviewMinAccuracy: 0.8,
			}).status,
		).toBe("secure");
	});
});
