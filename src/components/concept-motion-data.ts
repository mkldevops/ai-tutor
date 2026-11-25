/** Fixed teaching material. Never receives a lesson item or its expected answer. */
export type MotionExample = {
	label: string;
	captions: readonly [string, string, string, string];
} & (
	| {
			kind: "digits";
			value: number;
			operation: "multiply" | "divide";
			power: number;
			result: string;
			digits: string[];
			start: number[];
			end: number[];
	  }
	| { kind: "round"; value: number; unit: number }
	| {
			kind: "word";
			base: string;
			stem: string;
			affix: string;
			position: "prefix" | "suffix";
			result: string;
			meaning: string;
	  }
);

export type MotionPractice = {
	question: string;
	choices: readonly string[];
	answer: string;
	success: string;
	hints: Record<string, string>;
	method: string;
};

export type MotionConcept = {
	title: string;
	steps: readonly [string, string, string, string];
	examples: readonly MotionExample[];
	practice: MotionPractice;
};

export const placeNames = ["Thousands", "Hundreds", "Tens", "Ones", "Tenths", "Hundredths", "Thousandths"];
export const placeShortNames = ["1,000", "100", "10", "1", "0.1", "0.01", "0.001"];
export const formatMotionNumber = (value: number) => new Intl.NumberFormat("en-GB").format(value);

export function roundingState(value: number, unit: number) {
	const low = Math.floor(value / unit) * unit;
	const high = low + unit;
	const distanceLow = value - low;
	const distanceHigh = high - value;
	return {
		low,
		high,
		distanceLow,
		distanceHigh,
		result: distanceLow < distanceHigh ? low : high,
		fraction: distanceLow / unit,
	};
}

export function motionStep(position: number) {
	return Math.min(3, Math.floor(Math.max(0, Math.min(1, position)) * 4));
}

/** Gentle mode has four complete, discrete explanatory states. */
export function motionTravel(position: number, gentle: boolean) {
	if (gentle) return motionStep(position) >= 2 ? 1 : 0;
	const fraction = Math.max(0, Math.min(1, (position - 0.25) / 0.45));
	return fraction * fraction * (3 - 2 * fraction);
}

function digits(value: number, operation: "multiply" | "divide", power: number): MotionExample {
	const shift = operation === "multiply" ? -power : power;
	const text = String(value);
	const decimal = text.includes(".") ? text.indexOf(".") : text.length;
	const digitValues = text.replace(".", "").split("");
	const start = digitValues.map((_, index) => 4 - decimal + index);
	const end = start.map((column) => column + shift);
	const result = String(operation === "multiply" ? value * 10 ** power : value / 10 ** power);
	const direction = operation === "multiply" ? "left" : "right";
	const factor = formatMotionNumber(10 ** power);
	const label = `${value} ${operation === "multiply" ? "×" : "÷"} ${factor}`;
	return {
		kind: "digits",
		label,
		value,
		operation,
		power,
		result,
		digits: digitValues,
		start,
		end,
		captions: [
			`Start with ${value}. Each digit has a place and a value. The decimal point is fixed between ones and tenths.`,
			`${operation === "multiply" ? "Multiplying" : "Dividing"} by ${factor} makes each digit worth ${factor} times ${operation === "multiply" ? "more" : "less"}. Move ${power} ${power === 1 ? "place" : "places"} to the ${direction}.`,
			`Each digit moves ${power} ${power === 1 ? "place" : "places"} to the ${direction}. The decimal point stays still.`,
			`${label} = ${result}. Use zeros for empty places when writing the number.`,
		],
	};
}

function round(value: number, unit: number): MotionExample {
	const { low, high, distanceLow, distanceHigh, result } = roundingState(value, unit);
	const fmt = formatMotionNumber;
	const zeros = String(unit).length - 1;
	return {
		kind: "round",
		value,
		unit,
		label: `${fmt(value)} → nearest ${fmt(unit)}`,
		captions: [
			`Round ${fmt(value)} to the nearest ${fmt(unit)}. Find the closest multiple of ${fmt(unit)}.`,
			`The neighbouring multiples are ${fmt(low)} and ${fmt(high)}. Place ${fmt(value)} between them.`,
			distanceLow === distanceHigh
				? `Both neighbours are ${distanceLow} away. For a positive whole number exactly halfway, round up.`
				: `${fmt(value)} is ${distanceLow} away from ${fmt(low)} and ${distanceHigh} away from ${fmt(high)}. ${fmt(result)} is closer.`,
			`The rounded whole number is ${fmt(result)}. Its last ${zeros} digits are zeros; keep the higher place values too.`,
		],
	};
}

function word(
	base: string,
	stem: string,
	affix: string,
	position: "prefix" | "suffix",
	result: string,
	meaning: string,
): MotionExample {
	const spelling =
		base === stem
			? `Keep the spelling of ${base}.`
			: `Drop the final ${base.slice(-1)} from ${base}: ${stem}. This spelling change belongs to this word.`;
	return {
		kind: "word",
		base,
		stem,
		affix,
		position,
		result,
		meaning,
		label: position === "prefix" ? `${affix} + ${base}` : `${base} + ${affix}`,
		captions: [
			`Start with the ${position === "prefix" ? "verb" : "base word"} ${base}.`,
			`${position === "prefix" ? `The prefix ${affix}– goes before the verb.` : `The suffix –${affix} goes at the end to make a verb.`} ${spelling}`,
			`Join ${position === "prefix" ? `${affix} and ${stem}` : `${stem} and ${affix}`}: ${result}.`,
			`${result} means ${meaning}. ${spelling}`,
		],
	};
}

const powers: MotionConcept = {
	title: "Watch the digits change places",
	steps: ["Find the places", "Choose the direction", "Move the digits", "Read the result"],
	examples: [
		digits(4.7, "multiply", 1),
		digits(56, "divide", 2),
		digits(72, "multiply", 1),
		digits(6, "multiply", 3),
		digits(6, "divide", 3),
	],
	practice: {
		question: "Try together: 52 ÷ 10 = ?",
		choices: ["5.2", "0.52", "520"],
		answer: "5.2",
		success: "Yes! Each digit moves one place right: 52 ÷ 10 = 5.2.",
		hints: {
			"0.52": "That moves two places. Dividing by 10 needs just one place right.",
			"520": "That makes 52 bigger. Division by 10 makes it smaller; move the digits right.",
		},
		method: "Start with 5 tens and 2 ones. One place right makes 5 ones and 2 tenths: 5.2.",
	},
};

const rounding: MotionConcept = {
	title: "Two neighbours. Which is closer?",
	steps: ["Meet the number", "Find the neighbours", "Compare distances", "Keep the whole number"],
	examples: [round(2347, 100), round(5862, 100), round(1250, 100), round(38742, 1000)],
	practice: {
		question: "Try together: round 4,162 to the nearest 100.",
		choices: ["4,200", "4,162", "200"],
		answer: "4,200",
		success: "Yes! 4,200 is 38 away, while 4,100 is 62 away. Keep the thousands too.",
		hints: {
			"4,162": "Choose a whole hundred. Compare 4,100 and 4,200, then use zeros for tens and ones.",
			"200": "Keep the thousands too. Your rounded number should still be near 4,162.",
		},
		method: "The neighbours are 4,100 and 4,200. The distances are 62 and 38, so choose 4,200.",
	},
};

const prefixes: MotionConcept = {
	title: "A small beginning changes the meaning",
	steps: ["Read the verb", "Meet the prefix", "Join the pieces", "Explore the meaning"],
	examples: [
		word("play", "play", "re", "prefix", "replay", "play again"),
		word("read", "read", "mis", "prefix", "misread", "read wrongly"),
		word("frost", "frost", "de", "prefix", "defrost", "remove the frost or ice"),
		word("connect", "connect", "dis", "prefix", "disconnect", "break the connection"),
		word("cook", "cook", "over", "prefix", "overcook", "cook for too long"),
	],
	practice: {
		question: "Try together: which word means “read again”?",
		choices: ["reread", "misread", "overread"],
		answer: "reread",
		success: "Yes! Re– means again. Read → reread.",
		hints: {
			misread: "Mis– means wrongly. Look for the prefix that means again.",
			overread: "Over– can mean too much. Look for the prefix that means again.",
		},
		method: "Choose re– for again and keep read unchanged: re + read = reread.",
	},
};

const suffixes: MotionConcept = {
	title: "Build a verb with a new ending",
	steps: ["Read the base word", "Check the spelling", "Join the ending", "Use the new verb"],
	examples: [
		word("real", "real", "ise", "suffix", "realise", "become aware of something"),
		word("pure", "pur", "ify", "suffix", "purify", "make pure"),
		word("origin", "origin", "ate", "suffix", "originate", "begin or come from somewhere"),
		word("apology", "apolog", "ise", "suffix", "apologise", "say you are sorry"),
	],
	practice: {
		question: "Try together: turn pure into a verb meaning “make pure”.",
		choices: ["purify", "pureify", "purise"],
		answer: "purify",
		success: "Yes! Drop the final e, then add –ify: pure → purify.",
		hints: {
			pureify: "For this word, remove the final e before adding –ify.",
			purise: "The verb meaning make pure uses –ify. Start with pur–.",
		},
		method: "Pure loses its final e: pur. Add –ify to make purify.",
	},
};

const concepts: Record<string, MotionConcept> = {
	"MA-Y5-MD-POWERS10": powers,
	"MA-Y4-FR-DIV10-100": { ...powers, examples: [digits(56, "divide", 2), digits(52, "divide", 1)] },
	"MA-Y5-PV-ROUND": rounding,
	"EN-Y5-SP-VERB-PREFIXES": prefixes,
	"EN-Y5-SP-VERB-SUFFIXES": suffixes,
};

export function conceptForObjective(objectiveCode: string): MotionConcept | null {
	return Object.hasOwn(concepts, objectiveCode) ? concepts[objectiveCode] : null;
}

export function practiceFeedback(practice: MotionPractice, choice: string) {
	return choice === practice.answer
		? practice.success
		: (practice.hints[choice] ?? "Try one of the choices, or explore the method together.");
}
