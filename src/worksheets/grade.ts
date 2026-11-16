import { evaluate, NUM, OP } from "#/ai/arithmetic-check";

export type Verdict = "correct" | "incorrect" | "unchecked";
export type Grade = { verdict: Verdict; expected: string | null };

const EXPR = new RegExp(String.raw`^(?:${NUM})(?:\s*(?:${OP})\s*(?:${NUM}))*$`);
const ANSWER = new RegExp(`^(?:${NUM})$`);
const BLANK = /[☐□▢]|_+|\?|\.{3}|…/g;
const hasBlank = (s: string) => (s.match(BLANK) ?? []).length;
const UNCHECKED: Grade = { verdict: "unchecked", expected: null };

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const toNumber = (s: string) => Number(s.replace(/,/g, ""));
const format = (n: number) => String(Math.round(n * 1e6) / 1e6);
const same = (a: number, b: number) => Math.abs(a - b) < 1e-9;

function value(expr: string): number | null {
	const e = clean(expr);
	return EXPR.test(e) ? evaluate(e) : null;
}

export function gradeItem(question: string, childAnswer: string): Grade {
	const answer = clean(childAnswer);
	if (!ANSWER.test(answer)) return UNCHECKED;
	const given = toNumber(answer);
	const sides = clean(question)
		.replace(/(\d)\s*[xX]\s*(?=\d)/g, "$1 × ")
		.split("=");
	if (sides.length !== 2) return UNCHECKED;
	const [left, right] = sides.map(clean) as [string, string];
	const blanks = hasBlank(left) + hasBlank(right);

	if (blanks === 0 && right === "") {
		const expected = value(left);
		return expected === null ? UNCHECKED : verdict(same(expected, given), format(expected));
	}
	if (blanks !== 1) return UNCHECKED;
	if (hasBlank(right) && clean(right.replace(BLANK, "")) === "") {
		const expected = value(left);
		return expected === null ? UNCHECKED : verdict(same(expected, given), format(expected));
	}
	const l = value(left.replace(BLANK, answer));
	const r = value(right.replace(BLANK, answer));
	if (l === null || r === null) return UNCHECKED;
	return verdict(same(l, r), null);
}

function verdict(ok: boolean, expected: string | null): Grade {
	return { verdict: ok ? "correct" : "incorrect", expected: ok ? null : expected };
}
