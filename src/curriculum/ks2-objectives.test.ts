import { describe, expect, it } from "vitest";
import type { Item, ItemType } from "#/domain/types";
import { gradeResponse } from "#/learning-engine/grading";
import { getObjective, LESSON_OBJECTIVES_BY_YEAR, OBJECTIVES, PREREQUISITES } from "./england-nc";
import {
	ARTICLE_PHRASES,
	FRONTED_ADVERBIALS,
	frontedSentence,
	HOMOPHONE_SENTENCES,
	LINK_SENTENCES,
	NOUN_PREFIX_WORDS,
	PARENTHESIS_SENTENCES,
	SUFFIX_VERBS,
	suffixVerb,
	WORD_FAMILIES,
	withParenthesis,
} from "./english-gps-bank";
import { createRng, generateItem, hasGenerator, supportedTypes } from "./generators";
import { exchanges, isPrime } from "./maths-generators";

const NEW_MATHS = [
	"MA-Y3-PV-DIGIT-VALUE",
	"MA-Y3-AS-COLUMN",
	"MA-Y3-MD-WRITTEN",
	"MA-Y3-FR-OF-AMOUNT",
	"MA-Y5-PV-DIGIT-VALUE",
	"MA-Y5-AS-COLUMN",
	"MA-Y5-MD-PRIMES",
	"MA-Y5-MD-SQUARES",
];
const NEW_ENGLISH = [
	"EN-Y3-GR-A-AN",
	"EN-Y3-GR-CONJUNCTIONS",
	"EN-Y3-SP-NOUN-PREFIXES",
	"EN-Y3-SP-WORD-FAMILIES",
	"EN-Y5-SP-VERB-SUFFIXES",
	"EN-Y5-PU-PARENTHESIS",
	"EN-Y5-GR-ADVERBIALS",
	"EN-Y5-SP-HOMOPHONES",
];
const EXISTING = [
	"MA-Y2-AS-MENTAL",
	"MA-Y3-AS-MENTAL",
	"MA-Y3-PV-MORE-LESS",
	"MA-Y3-MD-TABLES-348",
	"MA-Y4-FR-DIV10-100",
	"MA-Y5-MD-POWERS10",
	"MA-Y5-PV-ROUND",
	"MA-Y5-MD-FACTORS",
	"EN-Y2-GR-TENSE",
	"EN-Y3-SP-PREFIXES",
	"EN-Y3-GR-PRESENT-PERFECT",
	"EN-Y3-PU-INVERTED-COMMAS",
	"EN-Y5-SP-VERB-PREFIXES",
	"EN-Y5-GR-RELATIVE-CLAUSES",
	"EN-Y5-GR-POSSIBILITY",
];

const num = (s: string) => Number(s.replace(/,/g, ""));

const sample = (code: string, type: ItemType): Item[] =>
	Array.from({ length: 150 }, (_, seed) =>
		([1, 2, 3] as const).map((difficulty) => generateItem(code, { rng: createRng(seed), difficulty, type, id: "x" })),
	).flat();

const all = (code: string): Item[] => supportedTypes(code).flatMap((type) => sample(code, type));

describe("curriculum graph", () => {
	const byCode = new Map(OBJECTIVES.map((o) => [o.code, o]));

	it("keeps every existing objective id", () => {
		for (const code of EXISTING) expect(byCode.has(code), code).toBe(true);
	});

	it("has unique codes that fit the Appwrite schema", () => {
		expect(byCode.size).toBe(OBJECTIVES.length);
		for (const o of OBJECTIVES) {
			expect(o.code.length).toBeLessThanOrEqual(40);
			expect(o.statement.length).toBeLessThanOrEqual(1000);
			expect(o.strand.length).toBeLessThanOrEqual(120);
			expect(o.code).toContain(`-Y${o.yearGroup}-`);
			expect(o.explanation.length).toBeGreaterThanOrEqual(2);
			expect(o.assessmentCriteria.length).toBeGreaterThanOrEqual(2);
		}
	});

	it("only links objectives that exist, from the same or an earlier year", () => {
		for (const e of PREREQUISITES) {
			const target = byCode.get(e.objectiveCode);
			const prereq = byCode.get(e.prerequisiteCode);
			expect(target, e.objectiveCode).toBeDefined();
			expect(prereq, e.prerequisiteCode).toBeDefined();
			expect(e.objectiveCode).not.toBe(e.prerequisiteCode);
			expect(prereq?.subject).toBe(target?.subject);
			expect(prereq?.yearGroup).toBeLessThanOrEqual(target?.yearGroup ?? 0);
		}
		const keys = PREREQUISITES.map((e) => `${e.objectiveCode}<${e.prerequisiteCode}`);
		expect(new Set(keys).size).toBe(keys.length);
	});

	it("has no prerequisite cycle", () => {
		const edges = new Map<string, string[]>();
		for (const e of PREREQUISITES)
			edges.set(e.objectiveCode, [...(edges.get(e.objectiveCode) ?? []), e.prerequisiteCode]);
		const state = new Map<string, "visiting" | "done">();
		const visit = (code: string, path: string[]): void => {
			if (state.get(code) === "done") return;
			if (state.get(code) === "visiting") throw new Error(`cycle: ${[...path, code].join(" -> ")}`);
			state.set(code, "visiting");
			for (const p of edges.get(code) ?? []) visit(p, [...path, code]);
			state.set(code, "done");
		};
		for (const o of OBJECTIVES) expect(() => visit(o.code, [])).not.toThrow();
	});

	it("offers every new objective as a lesson for its year", () => {
		for (const code of [...NEW_MATHS, ...NEW_ENGLISH]) {
			const o = getObjective(code);
			expect(o?.status).toBe("approved");
			expect(LESSON_OBJECTIVES_BY_YEAR[o?.yearGroup as 3 | 5]).toContain(code);
		}
	});
});

describe("every objective has gradable items", () => {
	for (const o of OBJECTIVES) {
		it(`${o.code}: at least two item types, deterministic, the answer grades as correct`, () => {
			expect(hasGenerator(o.code)).toBe(true);
			const types = supportedTypes(o.code);
			expect(types.length).toBeGreaterThanOrEqual(2);
			for (const type of types) {
				const a = generateItem(o.code, { rng: createRng(42), difficulty: 2, type, id: "a" });
				const b = generateItem(o.code, { rng: createRng(42), difficulty: 2, type, id: "a" });
				expect(a).toEqual(b);
			}
			for (const item of all(o.code)) {
				expect(item.objectiveCode).toBe(o.code);
				expect(item.answer.trim()).not.toBe("");
				expect(gradeResponse(item, item.answer).correct).toBe(true);
				if (item.choices) {
					expect(new Set(item.choices).size).toBe(item.choices.length);
					expect(item.choices.length).toBeGreaterThanOrEqual(3);
					expect(item.choices.filter((c) => gradeResponse(item, c).correct)).toEqual([item.answer]);
				}
			}
		});
	}
});

describe("new maths answers", () => {
	it("place value: the digit value, the missing part and the largest number are right", () => {
		for (const code of ["MA-Y3-PV-DIGIT-VALUE", "MA-Y5-PV-DIGIT-VALUE"]) {
			const len = (d: number) => (code.includes("Y3") ? 3 : d === 1 ? 5 : 6);
			for (const item of all(code)) {
				const value = item.prompt.match(/^What is the value of the digit (\d) in ([\d,]+)\?$/);
				const missing = item.prompt.match(/^([\d,]+) = (.+)$/);
				if (value) {
					const digits = value[2].replace(/,/g, "");
					expect(digits).toHaveLength(len(item.difficulty));
					const pos = digits.indexOf(value[1]);
					expect(num(item.answer)).toBe(Number(value[1]) * 10 ** (digits.length - 1 - pos));
				} else if (missing) {
					const known = missing[2]
						.split(" + ")
						.filter((p) => p !== "☐")
						.reduce((s, p) => s + num(p), 0);
					expect(known + num(item.answer)).toBe(num(missing[1]));
					expect(missing[2].split("☐")).toHaveLength(2);
				} else {
					expect(item.prompt).toBe("Which number is the largest?");
					expect(num(item.answer)).toBe(Math.max(...(item.choices ?? []).map(num)));
				}
			}
		}
	});

	it("column methods: the answer is the sum or difference, with the planned exchanges", () => {
		for (const code of ["MA-Y3-AS-COLUMN", "MA-Y5-AS-COLUMN"]) {
			for (const item of all(code)) {
				const sum = item.prompt.match(/^([\d,]+) ([+−]) ([\d,]+) = \?$/);
				const nums = item.prompt.match(/[\d,]{3,}/g)?.map(num) ?? [];
				expect(nums).toHaveLength(2);
				const [a, b] = nums as [number, number];
				const add = sum ? sum[2] === "+" : item.prompt.includes("altogether");
				expect(num(item.answer)).toBe(add ? a + b : a - b);
				expect(num(item.answer)).toBeGreaterThan(0);
				if (code === "MA-Y3-AS-COLUMN") {
					expect(a).toBeGreaterThanOrEqual(100);
					expect(b).toBeGreaterThanOrEqual(100);
					expect(num(item.answer)).toBeLessThanOrEqual(999);
					expect(exchanges(a, b, add)).toBe(item.difficulty - 1);
				} else {
					expect(Math.max(a, b)).toBeGreaterThanOrEqual(10000);
				}
			}
		}
	});

	it("written multiplication: two-digit times one-digit from the 2, 3, 4, 5 and 8 tables", () => {
		for (const item of all("MA-Y3-MD-WRITTEN")) {
			const plain = item.prompt.match(/^(\d+) × (\d) = \?$/);
			const missing = item.prompt.match(/^(\d) × ☐ = (\d+)$/);
			const story = item.prompt.match(/^Each box holds (\d+) pencils\. How many pencils are in (\d) boxes\?$/);
			if (missing) {
				expect(Number(missing[1]) * num(item.answer)).toBe(Number(missing[2]));
				continue;
			}
			const m = plain ?? story;
			expect(m).not.toBeNull();
			const [n, k] = [Number(m?.[1]), Number(m?.[2])];
			expect(n).toBeGreaterThanOrEqual(10);
			expect(n).toBeLessThanOrEqual(99);
			expect([2, 3, 4, 5, 8]).toContain(k);
			expect(num(item.answer)).toBe(n * k);
		}
	});

	it("fractions of amounts: whole-number answers, unit fractions before non-unit ones", () => {
		for (const item of all("MA-Y3-FR-OF-AMOUNT")) {
			const m = item.prompt.match(/(\d+)\/(\d+) of (?:them|(\d+))/);
			const amount = Number(m?.[3] ?? item.prompt.match(/There are (\d+) sweets/)?.[1]);
			const [n, d] = [Number(m?.[1]), Number(m?.[2])];
			expect(amount % d).toBe(0);
			expect(num(item.answer)).toBe((amount / d) * n);
			if (item.difficulty < 3) expect(n).toBe(1);
			else expect(n).toBeGreaterThan(1);
		}
	});

	it("primes: exactly one choice matches, next primes and smallest factors are right", () => {
		for (const item of all("MA-Y5-MD-PRIMES")) {
			if (item.type === "multiple_choice") {
				const wantPrime = item.prompt === "Which of these numbers is prime?";
				const matches = (item.choices ?? []).filter((c) => isPrime(num(c)) === wantPrime);
				expect(matches).toEqual([item.answer]);
				for (const c of item.choices ?? []) expect(num(c)).toBeLessThanOrEqual(100);
				continue;
			}
			const next = item.prompt.match(/^What is the next prime number after (\d+)\?$/);
			const factor = item.prompt.match(/^What is the smallest prime factor of (\d+)\?$/);
			const answer = num(item.answer);
			expect(isPrime(answer)).toBe(true);
			if (next) {
				const start = Number(next[1]);
				expect(answer).toBeGreaterThan(start);
				for (let k = start + 1; k < answer; k++) expect(isPrime(k)).toBe(false);
			} else {
				const n = Number(factor?.[1]);
				expect(n % answer).toBe(0);
				for (let k = 2; k < answer; k++) expect(n % k).not.toBe(0);
			}
		}
	});

	it("squares and cubes: values, roots and the only square or cube choice", () => {
		const isSquare = (n: number) => Number.isInteger(Math.sqrt(n));
		const isCube = (n: number) => Math.round(Math.cbrt(n)) ** 3 === n;
		for (const item of all("MA-Y5-MD-SQUARES")) {
			const power = item.prompt.match(/^(\d+)([²³]) = \?$/);
			const root = item.prompt.match(/^☐([²³]) = (\d+)$/);
			if (power) expect(num(item.answer)).toBe(Number(power[1]) ** (power[2] === "²" ? 2 : 3));
			else if (root) expect(num(item.answer) ** (root[1] === "²" ? 2 : 3)).toBe(Number(root[2]));
			else {
				const fits = item.prompt.includes("cube") ? isCube : isSquare;
				expect((item.choices ?? []).filter((c) => fits(num(c)))).toEqual([item.answer]);
			}
		}
	});
});

describe("new English answers", () => {
	it("a or an: only the phrase with the right article is offered as correct", () => {
		const right = new Set(ARTICLE_PHRASES.map((p) => `${p.article} ${p.noun}`));
		for (const item of sample("EN-Y3-GR-A-AN", "multiple_choice")) {
			expect(item.choices?.filter((c) => right.has(c))).toEqual([item.answer]);
		}
		for (const item of sample("EN-Y3-GR-A-AN", "written")) {
			const noun = item.prompt.replace("Write a or an to complete: _____ ", "");
			const phrase = ARTICLE_PHRASES.find((p) => p.noun === noun);
			expect(item.answer).toBe(phrase?.article);
			expect(item.answer).toBe(/^[aeiou]/.test(noun) ? "an" : "a");
		}
	});

	it("time, place and cause: the hand-checked word fills the gap", () => {
		for (const item of all("EN-Y3-GR-CONJUNCTIONS")) {
			const s = LINK_SENTENCES.find((x) => item.prompt.endsWith(x.sentence));
			expect(item.answer).toBe(s?.answer);
			if (item.type === "written")
				for (const w of [s?.answer, ...(s?.distractors ?? [])]) expect(item.prompt).toContain(`${w}`);
		}
	});

	it("noun prefixes: super–, anti– or auto– plus the unchanged root", () => {
		for (const item of all("EN-Y3-SP-NOUN-PREFIXES")) {
			const w = NOUN_PREFIX_WORDS.find((x) => x.word === item.answer);
			expect(["super", "anti", "auto"]).toContain(w?.prefix);
			expect(item.answer).toBe(`${w?.prefix}${w?.root}`);
			if (item.choices) {
				expect(item.choices.filter((c) => NOUN_PREFIX_WORDS.some((x) => x.word === c))).toEqual([item.answer]);
			}
		}
	});

	it("word families: exactly one choice shares the root and meaning", () => {
		for (const item of all("EN-Y3-SP-WORD-FAMILIES")) {
			const f = WORD_FAMILIES.find((x) => item.prompt.includes(`"${x.root}"`));
			const members = f?.members.map((m) => m.word) ?? [];
			expect(members).toContain(item.answer);
			if (item.choices) expect(item.choices.filter((c) => members.includes(c))).toEqual([item.answer]);
		}
		const allMembers = WORD_FAMILIES.flatMap((f) => f.members.map((m) => m.word));
		for (const f of WORD_FAMILIES) for (const l of f.lookalikes) expect(allMembers).not.toContain(l);
	});

	it("verb suffixes: the verb is the stem plus –ise, –ify or –ate", () => {
		const verbs = SUFFIX_VERBS.map(suffixVerb);
		for (const item of all("EN-Y5-SP-VERB-SUFFIXES")) {
			const v = SUFFIX_VERBS.find((x) => item.prompt.includes(`"${x.root}"`));
			expect(item.answer).toBe(v && suffixVerb(v));
			expect(item.answer).toMatch(/(ise|ify|ate)$/);
			if (item.choices) expect(item.choices.filter((c) => verbs.includes(c))).toEqual([item.answer]);
		}
	});

	it("parenthesis: a matching pair of marks around the extra information", () => {
		for (const item of all("EN-Y5-PU-PARENTHESIS")) {
			const p = PARENTHESIS_SENTENCES.find((x) => item.prompt.includes(x.extra) || item.answer.includes(x.before));
			expect(p).toBeDefined();
			if (!p) continue;
			if (item.type === "written") {
				expect(item.answer).toBe(p.extra);
				expect(item.prompt).toMatch(/\(.+\)|– .+ –|, .+, /);
			} else {
				const mark = item.prompt.match(/uses (brackets|dashes|commas)/)?.[1] as "brackets" | "dashes" | "commas";
				expect(item.answer).toBe(withParenthesis(p, mark));
				if (item.difficulty === 1) expect(mark).toBe("brackets");
			}
			expect(withParenthesis(p, "brackets")).toBe(`${p.before} (${p.extra}) ${p.after}`);
		}
	});

	it("adverbials: the fronted adverbial and its kind", () => {
		for (const item of all("EN-Y5-GR-ADVERBIALS")) {
			const a = FRONTED_ADVERBIALS.find((x) => item.prompt.endsWith(frontedSentence(x)));
			expect(a).toBeDefined();
			expect(item.answer).toBe(item.type === "written" ? a?.adverbial : a?.kind);
		}
	});

	it("homophones: the word whose meaning fits, never its sound-alike", () => {
		for (const item of all("EN-Y5-SP-HOMOPHONES")) {
			const h = HOMOPHONE_SENTENCES.find((x) => item.prompt.endsWith(x.sentence));
			expect(item.answer).toBe(h?.answer);
			if (item.choices) expect(item.choices).toContain(h?.confusable);
			else expect(item.prompt).toContain(`${h?.confusable}`);
		}
	});
});
