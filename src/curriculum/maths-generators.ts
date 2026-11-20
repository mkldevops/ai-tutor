import type { ItemType } from "#/domain/types";
import type { Generator } from "./generators";
import { choicesFor, formatNumber } from "./number-format";
import { int, pick, type Rng, shuffle } from "./rng";

const PLACES = ["Ones", "Tens", "Hundreds", "Thousands", "Ten thousands", "Hundred thousands", "Millions"] as const;
const UNITS = ["one", "ten", "hundred", "thousand", "ten thousand", "hundred thousand", "million"] as const;

export function digitsOf(n: number): number[] {
	return String(n).split("").reverse().map(Number);
}

export function exchanges(a: number, b: number, add: boolean): number {
	const da = digitsOf(a);
	const db = digitsOf(b);
	let carry = 0;
	let count = 0;
	for (let i = 0; i < Math.max(da.length, db.length); i++) {
		const x = da[i] ?? 0;
		const y = db[i] ?? 0;
		if (add) {
			carry = x + y + carry >= 10 ? 1 : 0;
		} else {
			carry = x - carry < y ? 1 : 0;
		}
		count += carry;
	}
	return count;
}

export function columnWorking(a: number, b: number, add: boolean): string {
	const da = digitsOf(a);
	const db = digitsOf(b);
	const steps: string[] = [];
	let carry = 0;
	for (let i = 0; i < Math.max(da.length, db.length); i++) {
		const x = da[i] ?? 0;
		const y = db[i] ?? 0;
		const place = PLACES[i] ?? "Next";
		if (add) {
			const sum = x + y + carry;
			const parts = carry ? `${x} + ${y} + ${carry}` : `${x} + ${y}`;
			carry = sum >= 10 ? 1 : 0;
			steps.push(
				carry
					? `${place}: ${parts} = ${sum}, write ${sum - 10} and exchange 1 ${UNITS[i + 1] ?? ""}.`
					: `${place}: ${parts} = ${sum}.`,
			);
		} else {
			const top = x - carry;
			carry = top < y ? 1 : 0;
			steps.push(
				carry
					? `${place}: exchange 1 ${UNITS[i + 1] ?? ""}, ${top + 10} − ${y} = ${top + 10 - y}.`
					: `${place}: ${top} − ${y} = ${top - y}.`,
			);
		}
	}
	if (add && carry) steps.push(`${PLACES[da.length] ?? "Next"}: write the exchanged 1.`);
	const result = add ? a + b : a - b;
	steps.push(`So ${formatNumber(a)} ${add ? "+" : "−"} ${formatNumber(b)} = ${formatNumber(result)}.`);
	return steps.join(" ");
}

function noExchangeMistake(a: number, b: number, add: boolean): number {
	const da = digitsOf(a);
	const db = digitsOf(b);
	let out = 0;
	for (let i = Math.max(da.length, db.length) - 1; i >= 0; i--) {
		const x = da[i] ?? 0;
		const y = db[i] ?? 0;
		out = out * 10 + (add ? (x + y) % 10 : Math.abs(x - y));
	}
	return out;
}

type Range = [number, number];

function columnPair(
	rng: Rng,
	add: boolean,
	aRange: Range,
	bRange: Range,
	maxResult: number,
	accept: (n: number) => boolean,
	fallback: [number, number],
): [number, number] {
	for (let i = 0; i < 300; i++) {
		let a = int(rng, ...aRange);
		let b = int(rng, ...bRange);
		if (!add && b > a) [a, b] = [b, a];
		if (add && a + b > maxResult) continue;
		if (!add && a === b) continue;
		if (accept(exchanges(a, b, add))) return [a, b];
	}
	return fallback;
}

function columnGenerator(
	objectiveCode: string,
	pairFor: (rng: Rng, difficulty: 1 | 2 | 3, add: boolean) => [number, number],
	nearMisses: (result: number) => number[],
	story: (a: string, b: string, add: boolean) => string,
): Generator {
	return ({ rng, difficulty, type, id }) => {
		const add = rng() < 0.5;
		const [a, b] = pairFor(rng, difficulty, add);
		const result = add ? a + b : a - b;
		const aStr = formatNumber(a);
		const bStr = formatNumber(b);
		const base = {
			id,
			objectiveCode,
			difficulty,
			hint: "Line up the columns by place value and start with the ones.",
			workedSolution: columnWorking(a, b, add),
			answer: formatNumber(result),
		};
		const prompt = `${aStr} ${add ? "+" : "−"} ${bStr} = ?`;
		switch (type) {
			case "multiple_choice":
				return {
					...base,
					type,
					prompt,
					choices: choicesFor(rng, result, [noExchangeMistake(a, b, add), ...nearMisses(result)]),
				};
			case "word_problem":
				return { ...base, type, prompt: story(aStr, bStr, add) };
			default:
				return { ...base, type: "numeric", prompt };
		}
	};
}

const Y3_COLUMN_FALLBACK: Record<string, [number, number]> = {
	"add-0": [234, 152],
	"add-1": [347, 225],
	"add-2": [368, 257],
	"sub-0": [476, 253],
	"sub-1": [452, 217],
	"sub-2": [532, 278],
};

const y3Column = columnGenerator(
	"MA-Y3-AS-COLUMN",
	(rng, difficulty, add) => {
		const want = difficulty - 1;
		const key = `${add ? "add" : "sub"}-${want}`;
		return columnPair(
			rng,
			add,
			[100, 899],
			[100, 899],
			999,
			(n) => n === want,
			Y3_COLUMN_FALLBACK[key] as [number, number],
		);
	},
	(r) => [r + 10, r - 10, r + 100],
	(a, b, add) =>
		add
			? `A cinema sold ${a} tickets on Saturday and ${b} tickets on Sunday. How many tickets did it sell altogether?`
			: `A train has ${a} seats. ${b} seats are taken. How many seats are free?`,
);

const y5Column = columnGenerator(
	"MA-Y5-AS-COLUMN",
	(rng, difficulty, add) => {
		if (difficulty === 3) {
			return columnPair(
				rng,
				add,
				[100000, 899999],
				[10000, 899999],
				999999,
				(n) => n >= 2,
				add ? [358476, 247835] : [602413, 254786],
			);
		}
		return columnPair(
			rng,
			add,
			[10000, 99999],
			[10000, 99999],
			999999,
			(n) => (difficulty === 1 ? n <= 1 : n >= 1),
			add ? [41253, 23416] : [58427, 23185],
		);
	},
	(r) => [r + 1000, r - 1000, r + 10],
	(a, b, add) =>
		add
			? `A stadium had ${a} visitors in May and ${b} visitors in June. How many visitors came altogether?`
			: `A town has ${a} people. ${b} of them are children. How many are adults?`,
);

function distinctDigits(rng: Rng, count: number): number[] {
	return shuffle(rng, [1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, count);
}

function digitValueGenerator(objectiveCode: string, lengthFor: (difficulty: 1 | 2 | 3) => number): Generator {
	return ({ rng, difficulty, type, id }) => {
		const digits = distinctDigits(rng, lengthFor(difficulty));
		const len = digits.length;
		const n = Number(digits.join(""));
		const parts = digits.map((d, i) => d * 10 ** (len - 1 - i));
		const nStr = formatNumber(n);
		const base = { id, objectiveCode, difficulty };
		if (type === "missing_number") {
			const missing = int(rng, 0, len - 1);
			const order = difficulty === 3 ? shuffle(rng, parts) : parts;
			const answer = parts[missing] as number;
			return {
				...base,
				type,
				prompt: `${nStr} = ${order.map((p) => (p === answer ? "☐" : formatNumber(p))).join(" + ")}`,
				answer: String(answer),
				hint: `Which digit of ${nStr} is not shown yet? What is it worth in its place?`,
				workedSolution: `${nStr} = ${parts.map(formatNumber).join(" + ")}, so the missing part is ${formatNumber(answer)}.`,
			};
		}
		if (type === "multiple_choice" && len >= 5 && difficulty > 1 && rng() < 0.5) {
			const swaps = shuffle(rng, [0, 1, 2, 3, 4].slice(0, len - 1)).slice(0, 3);
			const others = swaps.map((i) => {
				const d = [...digits];
				[d[i], d[i + 1]] = [d[i + 1] as number, d[i] as number];
				return Number(d.join(""));
			});
			const all = [n, ...others];
			const largest = Math.max(...all);
			return {
				...base,
				type,
				prompt: "Which number is the largest?",
				choices: choicesFor(
					rng,
					largest,
					all.filter((x) => x !== largest),
				),
				answer: formatNumber(largest),
				hint: "Compare the digits from the left. The first place where they differ decides.",
				workedSolution: `${formatNumber(largest)} is the largest: in order, ${[...all]
					.sort((x, y) => y - x)
					.map(formatNumber)
					.join(" > ")}.`,
			};
		}
		const pos = int(rng, 0, difficulty === 1 ? len - 1 : len - 2);
		const place = len - 1 - pos;
		const d = digits[pos] as number;
		const value = d * 10 ** place;
		const prompt = `What is the value of the digit ${d} in ${nStr}?`;
		const hint = `Count the places from the right: ones, tens, hundreds${len > 3 ? ", thousands…" : ""}.`;
		const workedSolution = `The ${d} is in the ${(PLACES[place] ?? "").toLowerCase()} place, so it is worth ${formatNumber(value)}.`;
		if (type === "multiple_choice") {
			const near = [place + 1, place - 1, place + 2, place - 2, place + 3, place - 3]
				.filter((k) => k >= 0 && k < len)
				.map((k) => d * 10 ** k);
			return {
				...base,
				type,
				prompt,
				choices: choicesFor(rng, value, [...near, n]),
				answer: formatNumber(value),
				hint,
				workedSolution,
			};
		}
		return { ...base, type: "numeric", prompt, answer: String(value), hint, workedSolution };
	};
}

const y3DigitValue = digitValueGenerator("MA-Y3-PV-DIGIT-VALUE", () => 3);
const y5DigitValue = digitValueGenerator("MA-Y5-PV-DIGIT-VALUE", (difficulty) => (difficulty === 1 ? 5 : 6));

const y3Written: Generator = ({ rng, difficulty, type, id }) => {
	let m: number;
	let n: number;
	if (difficulty === 1) {
		m = pick(rng, [2, 3, 4, 5]);
		n = int(rng, 1, 4) * 10 + int(rng, 1, Math.floor(9 / m));
	} else if (difficulty === 2) {
		m = pick(rng, [2, 3, 4, 5, 8]);
		n = int(rng, 12, 39);
	} else {
		m = pick(rng, [3, 4, 8]);
		n = int(rng, 1, 4) * 10 + int(rng, 3, 9);
	}
	const tens = Math.floor(n / 10) * 10;
	const ones = n % 10;
	const product = n * m;
	const workedSolution = `${n} × ${m} = ${tens} × ${m} + ${ones} × ${m} = ${tens * m} + ${ones * m} = ${product}.`;
	const base = {
		id,
		objectiveCode: "MA-Y3-MD-WRITTEN",
		difficulty,
		hint: `Split ${n} into ${tens} and ${ones}. Multiply each part by ${m}, then add.`,
		workedSolution,
	};
	const prompt = `${n} × ${m} = ?`;
	switch (type) {
		case "multiple_choice":
			return {
				...base,
				type,
				prompt,
				choices: choicesFor(rng, product, [tens * m + ((ones * m) % 10), tens * m + ones, product + m, product - m]),
				answer: formatNumber(product),
			};
		case "missing_number":
			return {
				...base,
				type,
				prompt: `${m} × ☐ = ${product}`,
				answer: String(n),
				hint: `Try tens first: ${m} × 10 = ${m * 10}. How many more ${m}s make ${product}?`,
			};
		case "word_problem":
			return {
				...base,
				type,
				prompt: `Each box holds ${n} pencils. How many pencils are in ${m} boxes?`,
				answer: String(product),
			};
		default:
			return { ...base, type: "numeric", prompt, answer: String(product) };
	}
};

const y3FractionOf: Generator = ({ rng, difficulty, type, id }) => {
	const denom = pick(rng, difficulty === 1 ? [2, 3, 4] : difficulty === 2 ? [2, 3, 4, 5, 8, 10] : [3, 4, 5, 8]);
	const num = difficulty === 3 ? int(rng, 2, denom - 1) : 1;
	const k = int(rng, 2, difficulty === 1 ? 6 : 10);
	const amount = denom * k;
	const answer = num * k;
	const frac = `${num}/${denom}`;
	const base = {
		id,
		objectiveCode: "MA-Y3-FR-OF-AMOUNT",
		difficulty,
		answer: String(answer),
		hint:
			num === 1
				? `Share ${amount} into ${denom} equal groups.`
				: `Find 1/${denom} first by dividing by ${denom}, then take ${num} of those groups.`,
		workedSolution:
			num === 1
				? `${amount} ÷ ${denom} = ${k}, so ${frac} of ${amount} is ${answer}.`
				: `${amount} ÷ ${denom} = ${k}, and ${k} × ${num} = ${answer}, so ${frac} of ${amount} is ${answer}.`,
	};
	const prompt = `What is ${frac} of ${amount}?`;
	switch (type) {
		case "multiple_choice":
			return {
				...base,
				type,
				prompt,
				choices: choicesFor(rng, answer, [k, amount - answer, answer + num, amount]),
				answer: formatNumber(answer),
			};
		case "word_problem":
			return {
				...base,
				type,
				prompt: `There are ${amount} sweets in a jar. Sam eats ${frac} of them. How many sweets does Sam eat?`,
			};
		default:
			return { ...base, type: "numeric", prompt };
	}
};

export function isPrime(n: number): boolean {
	if (n < 2) return false;
	for (let d = 2; d * d <= n; d++) if (n % d === 0) return false;
	return true;
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

const PRIME_BANDS: Record<1 | 2 | 3, { primes: number[]; composites: number[] }> = {
	1: { primes: range(2, 19).filter(isPrime), composites: range(4, 20).filter((n) => !isPrime(n)) },
	2: {
		primes: range(20, 50).filter(isPrime),
		composites: range(20, 50).filter((n) => n % 2 === 1 && !isPrime(n)),
	},
	3: {
		primes: range(50, 100).filter(isPrime),
		composites: range(50, 100).filter((n) => n % 2 === 1 && n % 5 !== 0 && !isPrime(n)),
	},
};

const SMALLEST_FACTOR_TARGETS = [35, 49, 51, 55, 57, 63, 65, 69, 77, 81, 85, 87, 91, 93, 95, 99] as const;

function smallestPrimeFactor(n: number): number {
	for (let d = 2; d <= n; d++) if (n % d === 0) return d;
	return n;
}

const y5Primes: Generator = ({ rng, difficulty, type, id }) => {
	const base = { id, objectiveCode: "MA-Y5-MD-PRIMES", difficulty };
	if (type === "multiple_choice") {
		const band = PRIME_BANDS[difficulty];
		const askPrime = difficulty === 1 || rng() < 0.6;
		const answer = pick(rng, askPrime ? band.primes : band.composites);
		const others = shuffle(rng, askPrime ? band.composites : band.primes);
		const workedSolution = askPrime
			? `${answer} is prime: its only factors are 1 and ${answer}. The others can be divided by a smaller number.`
			: `${answer} = ${smallestPrimeFactor(answer)} × ${answer / smallestPrimeFactor(answer)}, so it is composite. The others are prime.`;
		return {
			...base,
			type,
			prompt: askPrime ? "Which of these numbers is prime?" : "Which of these numbers is not prime?",
			choices: choicesFor(rng, answer, others),
			answer: formatNumber(answer),
			hint: "Try dividing by 2, 3, 5 and 7. A prime number has only two factors: 1 and itself.",
			workedSolution,
		};
	}
	if (difficulty === 3) {
		const n = pick(rng, SMALLEST_FACTOR_TARGETS);
		const f = smallestPrimeFactor(n);
		return {
			...base,
			type: "numeric",
			prompt: `What is the smallest prime factor of ${n}?`,
			answer: String(f),
			hint: `Try dividing ${n} by 2, then 3, then 5, then 7.`,
			workedSolution: `${n} = ${f} × ${n / f}, and no smaller prime divides ${n}, so the answer is ${f}.`,
		};
	}
	const start = difficulty === 1 ? int(rng, 1, 18) : int(rng, 20, 60);
	let next = start + 1;
	while (!isPrime(next)) next++;
	return {
		...base,
		type: "numeric",
		prompt: `What is the next prime number after ${start}?`,
		answer: String(next),
		hint: `Check ${start + 1}, ${start + 2}… Does each one have a factor other than 1 and itself?`,
		workedSolution: `${range(start + 1, next - 1)
			.map((c) => `${c} = ${smallestPrimeFactor(c)} × ${c / smallestPrimeFactor(c)}`)
			.concat(`${next} has only the factors 1 and ${next}, so it is prime`)
			.join("; ")}.`,
	};
};

const isSquare = (n: number) => Number.isInteger(Math.sqrt(n));
const isCube = (n: number) => Math.round(Math.cbrt(n)) ** 3 === n;

const y5Squares: Generator = ({ rng, difficulty, type, id }) => {
	const cube = difficulty === 1 ? false : rng() < (difficulty === 2 ? 0.3 : 0.6);
	const n = cube ? pick(rng, difficulty === 2 ? [2, 3] : [2, 3, 4, 5, 10]) : int(rng, 2, difficulty === 1 ? 10 : 12);
	const power = cube ? 3 : 2;
	const sign = cube ? "³" : "²";
	const value = n ** power;
	const workedSolution = `${n}${sign} = ${Array(power).fill(n).join(" × ")} = ${value}.`;
	const base = {
		id,
		objectiveCode: "MA-Y5-MD-SQUARES",
		difficulty,
		hint: cube ? `${n}³ means ${n} × ${n} × ${n}.` : `${n}² means ${n} × ${n}.`,
		workedSolution,
	};
	switch (type) {
		case "multiple_choice": {
			const fits = cube ? isCube : isSquare;
			const candidates = [value + 1, value - 1, value + 2, n * (n + 1), 2 * value, value + n].filter((x) => !fits(x));
			return {
				...base,
				type,
				prompt: cube ? "Which of these is a cube number?" : "Which of these is a square number?",
				choices: choicesFor(rng, value, candidates),
				answer: formatNumber(value),
				workedSolution: `${formatNumber(value)} = ${n}${sign}, so it is a ${cube ? "cube" : "square"} number.`,
			};
		}
		case "missing_number":
			return {
				...base,
				type,
				prompt: `☐${sign} = ${value}`,
				answer: String(n),
				hint: `Which number times itself${cube ? ", three times," : ""} makes ${value}?`,
			};
		default:
			return { ...base, type: "numeric", prompt: `${n}${sign} = ?`, answer: String(value) };
	}
};

export const MATHS_KS2_GENERATORS: Record<string, { gen: Generator; types: ItemType[] }> = {
	"MA-Y3-PV-DIGIT-VALUE": { gen: y3DigitValue, types: ["numeric", "multiple_choice", "missing_number"] },
	"MA-Y3-AS-COLUMN": { gen: y3Column, types: ["numeric", "multiple_choice", "word_problem"] },
	"MA-Y3-MD-WRITTEN": {
		gen: y3Written,
		types: ["numeric", "multiple_choice", "missing_number", "word_problem"],
	},
	"MA-Y3-FR-OF-AMOUNT": { gen: y3FractionOf, types: ["numeric", "multiple_choice", "word_problem"] },
	"MA-Y5-PV-DIGIT-VALUE": { gen: y5DigitValue, types: ["numeric", "multiple_choice", "missing_number"] },
	"MA-Y5-AS-COLUMN": { gen: y5Column, types: ["numeric", "multiple_choice", "word_problem"] },
	"MA-Y5-MD-PRIMES": { gen: y5Primes, types: ["numeric", "multiple_choice"] },
	"MA-Y5-MD-SQUARES": { gen: y5Squares, types: ["numeric", "multiple_choice", "missing_number"] },
};
