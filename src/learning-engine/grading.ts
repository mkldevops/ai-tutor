import type { Item } from "#/domain/types";

export function normaliseNumeric(raw: string): number | null {
	const cleaned = raw.trim().replace(/[\s,]/g, "").replace(/^\+/, "");
	if (!/^-?(\d+\.?\d*|\.\d+)$/.test(cleaned)) return null;
	const n = Number(cleaned);
	return Number.isFinite(n) ? n : null;
}

export type GradeResult = { correct: boolean; parsed: boolean };

export function gradeResponse(item: Item, response: string): GradeResult {
	const expected = normaliseNumeric(item.answer);
	const given = normaliseNumeric(response);
	if (expected === null) {
		return { correct: response.trim() === item.answer.trim(), parsed: true };
	}
	if (given === null) return { correct: false, parsed: false };
	return { correct: Math.abs(expected - given) < 1e-9, parsed: true };
}
