const num = (s: string) => Number(s.replace(/,/g, ""));
const fmt = (n: number) => String(Number(n.toFixed(6)));
const N = String.raw`([\d,]+(?:\.\d+)?)`;

export function normalise(s: string): string {
	return fmt(num(s.trim()));
}

export function solve(prompt: string): string {
	const apply = (a: number, op: string, b: number) => {
		if (op === "+") return a + b;
		if (op === "−") return a - b;
		if (op === "×") return a * b;
		return a / b;
	};
	let m = prompt.match(new RegExp(`^${N} ([+−×÷]) ${N} = \\?$`));
	if (m) return fmt(apply(num(m[1]), m[2], num(m[3])));
	m = prompt.match(new RegExp(`^${N} ([+−×÷]) ☐ = ${N}$`));
	if (m) {
		const a = num(m[1]);
		const r = num(m[3]);
		const inverse: Record<string, number> = { "+": r - a, "−": a - r, "×": r / a, "÷": a / r };
		return fmt(inverse[m[2]]);
	}
	m = prompt.match(new RegExp(`has ${N} books\\. It gets ${N} more`));
	if (m) return fmt(num(m[1]) + num(m[2]));
	m = prompt.match(new RegExp(`has ${N} apples\\. She sells ${N}\\.`));
	if (m) return fmt(num(m[1]) - num(m[2]));
	m = prompt.match(new RegExp(`holds ${N} kg of rice\\. How many kg do ${N} boxes`));
	if (m) return fmt(num(m[1]) * num(m[2]));
	m = prompt.match(new RegExp(`^${N} litres of juice are shared equally into ${N} bottles`));
	if (m) return fmt(num(m[1]) / num(m[2]));
	throw new Error(`Unsupported prompt: ${prompt}`);
}
