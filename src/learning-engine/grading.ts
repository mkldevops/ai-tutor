import type { Item } from "#/domain/types";

export function normaliseNumeric(raw: string): number | null {
	const cleaned = raw.trim().replace(/[\s,]/g, "").replace(/^\+/, "");
	if (!/^-?(\d+\.?\d*|\.\d+)$/.test(cleaned)) return null;
	const n = Number(cleaned);
	return Number.isFinite(n) ? n : null;
}

export function normaliseText(raw: string): string {
	return raw
		.normalize("NFKC")
		.replace(/[“”„«»]/g, '"')
		.replace(/[‘’‚]/g, "'")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/[\s.,!?]+$/, "")
		.toLowerCase();
}

export type GradeResult = { correct: boolean; parsed: boolean };

export function gradeResponse(item: Item, response: string): GradeResult {
	if (item.type === "written") {
		const given = normaliseText(response);
		const expected = [item.answer, ...(item.accept ?? [])].map(normaliseText);
		return { correct: given !== "" && expected.includes(given), parsed: given !== "" };
	}
	const expected = normaliseNumeric(item.answer);
	const given = normaliseNumeric(response);
	if (expected === null) {
		return { correct: response.trim() === item.answer.trim(), parsed: true };
	}
	if (given === null) return { correct: false, parsed: false };
	return { correct: Math.abs(expected - given) < 1e-9, parsed: true };
}

export function isAmericanSpelling(item: Item, response: string): boolean {
	if (item.type !== "written") return false;
	const given = normaliseText(response);
	const expected = normaliseText(item.answer);
	return given !== expected && /iz/.test(given) && given.replace(/iz/g, "is") === expected;
}
