export type ArithmeticError = { claim: string; correct: string };

export const NUM = String.raw`\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?`;
export const OP = String.raw`[+\-−×÷*]|\bx\b`;
const CLAIM = new RegExp(
	String.raw`(?<![\d,/]|\d\.|(?:${OP})\s*)((?:${NUM})(?:\s*(?:${OP})\s*(?:${NUM}))+)\s*=\s*(${NUM})(?![\d/]|\s*r\b|\s*remainder\b)`,
	"g",
);
const TOKEN = new RegExp(String.raw`(${NUM})|(${OP})`, "g");

const toNumber = (s: string) => Number(s.replace(/,/g, ""));

export function evaluate(expr: string): number | null {
	const tokens = [...expr.matchAll(TOKEN)].map((m) => m[0]);
	const values: number[] = [toNumber(tokens[0] ?? "")];
	const ops: string[] = [];
	for (let i = 1; i + 1 < tokens.length; i += 2) {
		const op = tokens[i] as string;
		const value = toNumber(tokens[i + 1] as string);
		if ("×*x÷".includes(op)) {
			const left = values.pop() as number;
			if (op === "÷" && value === 0) return null;
			values.push(op === "÷" ? left / value : left * value);
		} else {
			values.push(value);
			ops.push(op === "+" ? "+" : "-");
		}
	}
	return ops.reduce(
		(acc, op, i) => (op === "+" ? acc + (values[i + 1] as number) : acc - (values[i + 1] as number)),
		values[0] as number,
	);
}

const format = (n: number) => String(Math.round(n * 1e6) / 1e6);

export function findArithmeticErrors(text: string): ArithmeticError[] {
	const errors: ArithmeticError[] = [];
	for (const m of text.matchAll(CLAIM)) {
		const value = evaluate(m[1] as string);
		if (value === null) continue;
		if (Math.abs(value - toNumber(m[2] as string)) > 1e-9) {
			errors.push({ claim: m[0].trim(), correct: `${(m[1] as string).trim()} = ${format(value)}` });
		}
	}
	return errors;
}
