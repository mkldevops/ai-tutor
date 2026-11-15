import type { Item, ItemType } from "#/domain/types";

export type Rng = () => number;

export function createRng(seed: number): Rng {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export function hashSeed(input: string): number {
	let h = 2166136261;
	for (let i = 0; i < input.length; i++) {
		h ^= input.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}

const int = (rng: Rng, min: number, max: number) => Math.floor(rng() * (max - min + 1)) + min;
const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[int(rng, 0, xs.length - 1)] as T;

export function formatNumber(n: number): string {
	const rounded = Math.round(n * 1e6) / 1e6;
	const [whole, frac] = String(rounded).split(".");
	const withCommas = (whole ?? "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
	return frac ? `${withCommas}.${frac}` : withCommas;
}

function shuffle<T>(rng: Rng, xs: T[]): T[] {
	const out = [...xs];
	for (let i = out.length - 1; i > 0; i--) {
		const j = int(rng, 0, i);
		[out[i], out[j]] = [out[j] as T, out[i] as T];
	}
	return out;
}

function choicesFor(rng: Rng, answer: number, distractors: number[]): string[] {
	const unique = [...new Set(distractors.filter((d) => d !== answer && d >= 0))].slice(0, 3);
	return shuffle(rng, [answer, ...unique].map(formatNumber));
}

type GenArgs = { rng: Rng; difficulty: 1 | 2 | 3; type: ItemType; id: string };
type Generator = (args: GenArgs) => Item;

const y2AddSub: Generator = ({ rng, difficulty, type, id }) => {
	const a = int(rng, 21, 78);
	const useTens = difficulty > 1 && rng() < 0.6;
	const b = useTens ? int(rng, 1, 2) * 10 : int(rng, 2, difficulty === 1 ? 5 : 9);
	const add = rng() < 0.5;
	const result = add ? a + b : a - b;
	const op = add ? "+" : "−";
	const part = useTens ? "tens" : "ones";
	const prompt = `${a} ${op} ${b} = ?`;
	return {
		id,
		objectiveCode: "MA-Y2-AS-MENTAL",
		type: type === "multiple_choice" ? "multiple_choice" : "numeric",
		difficulty,
		prompt,
		...(type === "multiple_choice" ? { choices: choicesFor(rng, result, [result + 10, result - 10, result + 1]) } : {}),
		answer: String(result),
		hint: `Look at the ${part} digit of ${a}.`,
		workedSolution: `${a} ${op} ${b} = ${result}. Only the ${part} change.`,
	};
};

const y3AddSub: Generator = ({ rng, difficulty, type, id }) => {
	const place = pick(rng, ["ones", "tens", "hundreds"] as const);
	const unit = place === "ones" ? 1 : place === "tens" ? 10 : 100;
	let a: number;
	let digit: number;
	const add = rng() < 0.5;
	if (difficulty === 1) {
		a = int(rng, 1, 7) * 100 + int(rng, 1, 5) * 10 + int(rng, 1, 5);
		digit = int(rng, 1, 3);
	} else {
		a = int(rng, 1, 8) * 100 + int(rng, 0, 9) * 10 + int(rng, 0, 9);
		digit = int(rng, 3, 9);
	}
	if (place === "hundreds") {
		digit = add ? Math.min(digit, 9 - Math.floor(a / 100)) : Math.min(digit, Math.floor(a / 100));
		digit = Math.max(digit, 1);
		if (!add && Math.floor(a / 100) < 1) a += 100;
	}
	if (!add && a - digit * unit < 0) a += digit * unit;
	if (add && a + digit * unit > 999) a -= digit * unit;
	const b = digit * unit;
	const result = add ? a + b : a - b;
	const op = add ? "+" : "−";
	const hint = `Which digit of ${a} is the ${place} digit? Change that one${
		place !== "hundreds" ? `, and exchange if it goes past ${add ? 9 : 0}` : ""
	}.`;
	const workedSolution = `${a} ${op} ${b} = ${result}. Check: ${result} ${add ? "−" : "+"} ${b} = ${a}.`;
	const base = { id, objectiveCode: "MA-Y3-AS-MENTAL", difficulty, hint, workedSolution };
	switch (type) {
		case "multiple_choice":
			return {
				...base,
				type,
				prompt: `${a} ${op} ${b} = ?`,
				choices: choicesFor(rng, result, [
					add ? a + digit : a - digit,
					add ? a + digit * 10 : a - digit * 10,
					add ? a + digit * 100 : a - digit * 100,
					result + 10,
				]),
				answer: formatNumber(result),
			};
		case "missing_number":
			return {
				...base,
				type,
				prompt: `${a} ${op} ☐ = ${result}`,
				answer: String(b),
				hint: `Think: what do I ${add ? "add to" : "take from"} ${a} to make ${result}?`,
			};
		case "word_problem":
			return {
				...base,
				type,
				prompt: add
					? `A library has ${a} books. It gets ${b} more. How many books does it have now?`
					: `A farmer has ${a} apples. She sells ${b}. How many apples are left?`,
				answer: String(result),
			};
		default:
			return { ...base, type: "numeric", prompt: `${a} ${op} ${b} = ?`, answer: String(result) };
	}
};

const y4Div: Generator = ({ rng, difficulty, type, id }) => {
	const n = difficulty === 1 ? int(rng, 1, 9) : int(rng, 11, 99);
	const d = difficulty === 1 ? 10 : pick(rng, [10, 100]);
	const result = n / d;
	const prompt = `${n} ÷ ${d} = ?`;
	return {
		id,
		objectiveCode: "MA-Y4-FR-DIV10-100",
		type: type === "multiple_choice" ? "multiple_choice" : "numeric",
		difficulty,
		prompt,
		...(type === "multiple_choice" ? { choices: choicesFor(rng, result, [n / (d * 10), (n * 10) / d, n * d]) } : {}),
		answer: formatNumber(result),
		hint: `Dividing by ${d} moves each digit ${d === 10 ? "one place" : "two places"} to the right.`,
		workedSolution: `${n} ÷ ${d} = ${formatNumber(result)}.`,
	};
};

const y5Powers: Generator = ({ rng, difficulty, type, id }) => {
	const factor = pick(rng, difficulty === 1 ? [10, 100] : [10, 100, 1000]);
	const places = Math.log10(factor);
	const multiply = rng() < 0.55;
	let n: number;
	if (difficulty === 1) n = int(rng, 2, 99);
	else if (difficulty === 2) n = int(rng, 11, 999) / 10;
	else n = int(rng, 101, 9999) / 100;
	if (!multiply && difficulty === 1) n = int(rng, 2, 99) * factor;
	const result = multiply ? n * factor : n / factor;
	const op = multiply ? "×" : "÷";
	const nStr = formatNumber(n);
	const rStr = formatNumber(result);
	const hint = `${multiply ? "Multiplying" : "Dividing"} by ${formatNumber(factor)} moves every digit ${places} place${
		places > 1 ? "s" : ""
	} to the ${multiply ? "left" : "right"}.`;
	const workedSolution = `${nStr} ${op} ${formatNumber(factor)} = ${rStr}. The digits move ${places} place${
		places > 1 ? "s" : ""
	}; the decimal point stays still.`;
	const base = { id, objectiveCode: "MA-Y5-MD-POWERS10", difficulty, hint, workedSolution };
	switch (type) {
		case "multiple_choice":
			return {
				...base,
				type,
				prompt: `${nStr} ${op} ${formatNumber(factor)} = ?`,
				choices: choicesFor(rng, result, [
					multiply ? n * (factor / 10 || 1) : n / (factor / 10 || 1),
					multiply ? n * factor * 10 : n / (factor * 10),
					multiply ? n / factor : n * factor,
				]),
				answer: rStr,
			};
		case "missing_number":
			return {
				...base,
				type,
				prompt: `${nStr} ${op} ☐ = ${rStr}`,
				answer: formatNumber(factor),
				hint: `Count how many places the digits moved from ${nStr} to ${rStr}.`,
			};
		case "word_problem":
			return {
				...base,
				type,
				prompt: multiply
					? `One box holds ${nStr} kg of rice. How many kg do ${formatNumber(factor)} boxes hold?`
					: `${nStr} litres of juice are shared equally into ${formatNumber(factor)} bottles. How many litres in each bottle?`,
				answer: rStr,
			};
		default:
			return { ...base, type: "numeric", prompt: `${nStr} ${op} ${formatNumber(factor)} = ?`, answer: rStr };
	}
};

const GENERATORS: Record<string, { gen: Generator; types: ItemType[] }> = {
	"MA-Y2-AS-MENTAL": { gen: y2AddSub, types: ["numeric", "multiple_choice"] },
	"MA-Y3-AS-MENTAL": {
		gen: y3AddSub,
		types: ["numeric", "multiple_choice", "missing_number", "word_problem"],
	},
	"MA-Y4-FR-DIV10-100": { gen: y4Div, types: ["numeric", "multiple_choice"] },
	"MA-Y5-MD-POWERS10": {
		gen: y5Powers,
		types: ["numeric", "multiple_choice", "missing_number", "word_problem"],
	},
};

export function hasGenerator(objectiveCode: string): boolean {
	return objectiveCode in GENERATORS;
}

export function supportedTypes(objectiveCode: string): ItemType[] {
	const g = GENERATORS[objectiveCode];
	if (!g) throw new Error(`No generator for ${objectiveCode}`);
	return g.types;
}

export function generateItem(
	objectiveCode: string,
	opts: { rng: Rng; difficulty: 1 | 2 | 3; type?: ItemType; id: string },
): Item {
	const g = GENERATORS[objectiveCode];
	if (!g) throw new Error(`No generator for ${objectiveCode}`);
	const type = opts.type && g.types.includes(opts.type) ? opts.type : pick(opts.rng, g.types);
	return g.gen({ rng: opts.rng, difficulty: opts.difficulty, type, id: opts.id });
}

export function generateMixedSet(
	objectiveCode: string,
	opts: { rng: Rng; count: number; difficulty: 1 | 2 | 3; idPrefix: string },
): Item[] {
	const types = supportedTypes(objectiveCode);
	return Array.from({ length: opts.count }, (_, i) =>
		generateItem(objectiveCode, {
			rng: opts.rng,
			difficulty: opts.difficulty,
			type: types[i % types.length],
			id: `${opts.idPrefix}-${i}`,
		}),
	);
}
