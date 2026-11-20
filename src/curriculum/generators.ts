import type { Item, ItemType } from "#/domain/types";

import { ENGLISH_GENERATORS } from "./english-generators";
import { MATHS_KS2_GENERATORS } from "./maths-generators";
import { choicesFor, formatNumber } from "./number-format";
import { createRng, hashSeed, int, pick, type Rng, shuffle } from "./rng";

export { createRng, formatNumber, hashSeed, type Rng };

export type GenArgs = { rng: Rng; difficulty: 1 | 2 | 3; type: ItemType; id: string };
export type Generator = (args: GenArgs) => Item;

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

const y3MoreLess: Generator = ({ rng, difficulty, type, id }) => {
	const base = { id, objectiveCode: "MA-Y3-PV-MORE-LESS", difficulty };
	if (type === "missing_number") {
		const step = pick(rng, difficulty === 1 ? [50, 100] : [4, 8, 50, 100]);
		const start = int(rng, difficulty === 3 ? 4 : 0, 8);
		const terms = [0, 1, 2, 3].map((i) => (start + i) * step);
		const answer = terms[3] as number;
		return {
			...base,
			type,
			prompt: `${terms.slice(0, 3).map(formatNumber).join(", ")}, ☐`,
			answer: String(answer),
			hint: `How much is added each step? Add it once more to ${formatNumber(terms[2] as number)}.`,
			workedSolution: `The count goes up in ${step}s: ${formatNumber(terms[2] as number)} + ${step} = ${formatNumber(answer)}.`,
		};
	}
	const step = pick(rng, [10, 100] as const);
	const more = rng() < 0.5;
	let a = difficulty === 1 ? int(rng, 1, 8) * 100 + int(rng, 1, 8) * 10 + int(rng, 0, 9) : int(rng, 100, 899);
	if (difficulty === 3 && step === 10) a = int(rng, 1, 8) * 100 + (more ? 90 : 0) + int(rng, 0, 9);
	const result = more ? a + step : a - step;
	const word = more ? "more" : "less";
	const place = step === 10 ? "tens" : "hundreds";
	const hint = `Find the ${place} digit of ${a}. It goes ${more ? "up" : "down"} by one.`;
	const workedSolution = `${step} ${word} than ${a} is ${result}: ${a} ${more ? "+" : "−"} ${step} = ${result}.`;
	switch (type) {
		case "multiple_choice":
			return {
				...base,
				type,
				prompt: `What is ${step} ${word} than ${a}?`,
				choices: choicesFor(rng, result, [
					more ? a + 1 : a - 1,
					more ? a + (step === 10 ? 100 : 10) : a - (step === 10 ? 100 : 10),
					more ? a - step : a + step,
				]),
				answer: formatNumber(result),
				hint,
				workedSolution,
			};
		case "word_problem":
			return {
				...base,
				type,
				prompt: more
					? `A school has ${a} pupils. Next year it will have ${step} more. How many pupils will it have?`
					: `A shop has ${a} stickers. It sells ${step}. How many stickers are left?`,
				answer: String(result),
				hint,
				workedSolution,
			};
		default:
			return {
				...base,
				type: "numeric",
				prompt: `What is ${step} ${word} than ${a}?`,
				answer: String(result),
				hint,
				workedSolution,
			};
	}
};

const y3Tables: Generator = ({ rng, difficulty, type, id }) => {
	const table = pick(rng, difficulty === 1 ? [3, 4] : [3, 4, 8]);
	const n = difficulty === 1 ? int(rng, 1, 6) : int(rng, 2, 12);
	const product = table * n;
	const divide = difficulty > 1 && rng() < 0.4;
	const hint = table === 8 ? `Double the 4 times table: 4 × ${n} = ${4 * n}.` : `Count up in ${table}s, ${n} times.`;
	const workedSolution = `${table} × ${n} = ${product}, so ${product} ÷ ${table} = ${n}.`;
	const base = { id, objectiveCode: "MA-Y3-MD-TABLES-348", difficulty, hint, workedSolution };
	const prompt = divide ? `${product} ÷ ${table} = ?` : `${table} × ${n} = ?`;
	const result = divide ? n : product;
	switch (type) {
		case "multiple_choice":
			return {
				...base,
				type,
				prompt,
				choices: choicesFor(
					rng,
					result,
					divide ? [n + 1, n - 1, table] : [product + table, product - table, table + n],
				),
				answer: formatNumber(result),
			};
		case "missing_number":
			return {
				...base,
				type,
				prompt: `${table} × ☐ = ${product}`,
				answer: String(n),
				hint: `Count in ${table}s until you reach ${product}.`,
			};
		case "word_problem":
			return {
				...base,
				type,
				prompt: divide
					? `${product} pens are shared into packs of ${table}. How many packs are there?`
					: `There are ${n} packs with ${table} pens in each. How many pens are there altogether?`,
				answer: String(result),
			};
		default:
			return { ...base, type: "numeric", prompt, answer: String(result) };
	}
};

function roundTo(n: number, to: number): number {
	return Math.round(n / to) * to;
}

const y5Round: Generator = ({ rng, difficulty, type, id }) => {
	const to = pick(rng, difficulty === 1 ? [10, 100] : difficulty === 2 ? [100, 1000, 10000] : [1000, 10000, 100000]);
	const n = int(rng, difficulty === 1 ? 1001 : difficulty === 2 ? 10001 : 100001, difficulty === 1 ? 99999 : 999999);
	const result = roundTo(n, to);
	const nStr = formatNumber(n);
	const toStr = formatNumber(to);
	const hint = `Find the ${toStr}s digit, then look at the digit to its right. 5 or more rounds up.`;
	const workedSolution = `${nStr} rounded to the nearest ${toStr} is ${formatNumber(result)}.`;
	const base = { id, objectiveCode: "MA-Y5-PV-ROUND", difficulty, hint, workedSolution };
	const prompt = `Round ${nStr} to the nearest ${toStr}.`;
	switch (type) {
		case "multiple_choice":
			return {
				...base,
				type,
				prompt,
				choices: choicesFor(rng, result, [result + to, result - to, roundTo(n, to === 10 ? 100 : to / 10)]),
				answer: formatNumber(result),
			};
		case "word_problem":
			return {
				...base,
				type,
				prompt: `${nStr} people watched a football match. Round this to the nearest ${toStr}.`,
				answer: formatNumber(result),
			};
		default:
			return { ...base, type: "numeric", prompt, answer: formatNumber(result) };
	}
};

function factorsOf(n: number): number[] {
	return Array.from({ length: n }, (_, i) => i + 1).filter((d) => n % d === 0);
}

const y5Factors: Generator = ({ rng, difficulty, type, id }) => {
	const base = { id, objectiveCode: "MA-Y5-MD-FACTORS", difficulty };
	if (type === "multiple_choice") {
		const n = pick(rng, difficulty === 1 ? [12, 18, 20, 24] : [24, 30, 36, 40, 42, 48, 56, 60]);
		const factors = factorsOf(n).filter((f) => f > 1 && f < n);
		const answer = pick(rng, factors);
		const others = Array.from({ length: 10 }, (_, i) => i + 2).filter((d) => n % d !== 0);
		return {
			...base,
			type,
			prompt: `Which of these is a factor of ${n}?`,
			choices: choicesFor(rng, answer, shuffle(rng, others)),
			answer: formatNumber(answer),
			hint: `A factor divides ${n} exactly, with nothing left over.`,
			workedSolution: `${n} ÷ ${answer} = ${n / answer}, so ${answer} is a factor of ${n}.`,
		};
	}
	if (type === "numeric" && difficulty === 3) {
		const g = pick(rng, [2, 3, 4, 5, 6]);
		const [p, q] = shuffle(rng, [2, 3, 5, 7]) as [number, number];
		const a = g * p;
		const b = g * q;
		return {
			...base,
			type,
			prompt: `What is the largest number that is a factor of both ${a} and ${b}?`,
			answer: String(g),
			hint: `List the factors of ${a}, then find the biggest one that also divides ${b}.`,
			workedSolution: `${a} = ${g} × ${p} and ${b} = ${g} × ${q}, so ${g} is the largest common factor.`,
		};
	}
	const a = int(rng, 2, difficulty === 1 ? 6 : 12);
	const b = int(rng, 2, difficulty === 1 ? 6 : 12);
	const n = a * b;
	const workedSolution = `${a} × ${b} = ${n}, so ${a} and ${b} are a factor pair of ${n}.`;
	switch (type) {
		case "word_problem":
			return {
				...base,
				type,
				prompt: `${n} chairs are put in ${a} equal rows. How many chairs are in each row?`,
				answer: String(b),
				hint: `Which number goes with ${a} to make ${n}?`,
				workedSolution,
			};
		case "missing_number":
			return {
				...base,
				type,
				prompt: `${a} × ☐ = ${n}`,
				answer: String(b),
				hint: `Find the partner of ${a} in a factor pair of ${n}.`,
				workedSolution,
			};
		default:
			return {
				...base,
				type: "numeric",
				prompt: `${a} is a factor of ${n}. What is the other number in the factor pair?`,
				answer: String(b),
				hint: `${a} × ? = ${n}`,
				workedSolution,
			};
	}
};

const GENERATORS: Record<string, { gen: Generator; types: ItemType[] }> = {
	"MA-Y2-AS-MENTAL": { gen: y2AddSub, types: ["numeric", "multiple_choice"] },
	"MA-Y3-AS-MENTAL": {
		gen: y3AddSub,
		types: ["numeric", "multiple_choice", "missing_number", "word_problem"],
	},
	"MA-Y3-PV-MORE-LESS": {
		gen: y3MoreLess,
		types: ["numeric", "multiple_choice", "missing_number", "word_problem"],
	},
	"MA-Y3-MD-TABLES-348": {
		gen: y3Tables,
		types: ["numeric", "multiple_choice", "missing_number", "word_problem"],
	},
	"MA-Y4-FR-DIV10-100": { gen: y4Div, types: ["numeric", "multiple_choice"] },
	"MA-Y5-MD-POWERS10": {
		gen: y5Powers,
		types: ["numeric", "multiple_choice", "missing_number", "word_problem"],
	},
	"MA-Y5-PV-ROUND": { gen: y5Round, types: ["numeric", "multiple_choice", "word_problem"] },
	"MA-Y5-MD-FACTORS": {
		gen: y5Factors,
		types: ["numeric", "multiple_choice", "missing_number", "word_problem"],
	},
	...MATHS_KS2_GENERATORS,
	...ENGLISH_GENERATORS,
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
