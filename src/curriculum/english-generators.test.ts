import { describe, expect, it } from "vitest";
import type { Item, ItemType } from "#/domain/types";
import { gradeResponse, normaliseText } from "#/learning-engine/grading";
import { continueToPractice, currentItem, startLesson, submitAnswer } from "#/learning-engine/lesson";
import { evaluateMastery } from "#/learning-engine/mastery";
import { getPrerequisiteCodes, LESSON_OBJECTIVES_BY_YEAR } from "./england-nc";
import { ENGLISH_OBJECTIVES, ENGLISH_PREREQUISITES } from "./england-nc-english";
import {
	CERTAIN_WORDS,
	PERFECT_VERBS,
	POSSIBLE_WORDS,
	RELATIVE_SENTENCES,
	Y3_PREFIX_WORDS,
	Y5_PREFIX_WORDS,
} from "./english-bank";
import { createRng, generateItem, supportedTypes } from "./generators";

const sample = (code: string, type: ItemType): Item[] =>
	Array.from({ length: 120 }, (_, seed) =>
		([1, 2, 3] as const).map((difficulty) => generateItem(code, { rng: createRng(seed), difficulty, type, id: "x" })),
	).flat();

describe("English curriculum", () => {
	it("cites the DfE English programme of study for every objective", () => {
		for (const o of ENGLISH_OBJECTIVES) {
			expect(o.subject).toBe("english");
			expect(o.source.publisher).toBe("Department for Education");
			expect(o.source.verification).toBe("verbatim_checked");
			expect(o.source.url).toMatch(/^https:\/\/(www\.gov\.uk|assets\.publishing\.service\.gov\.uk)\//);
			expect(o.explanation.length).toBeGreaterThanOrEqual(2);
		}
	});

	it("offers seven English lessons per year next to Maths", () => {
		for (const year of [3, 5] as const) {
			const english = LESSON_OBJECTIVES_BY_YEAR[year].filter((c) => c.startsWith("EN-"));
			expect(english).toHaveLength(7);
			for (const code of english) expect(code).toContain(`-Y${year}-`);
		}
	});

	it("links prerequisites to objectives that exist and come from an earlier year", () => {
		const byCode = new Map(ENGLISH_OBJECTIVES.map((o) => [o.code, o]));
		for (const e of ENGLISH_PREREQUISITES) {
			const target = byCode.get(e.objectiveCode);
			const prereq = byCode.get(e.prerequisiteCode);
			expect(prereq?.yearGroup).toBeLessThan(target?.yearGroup ?? 0);
		}
		expect(getPrerequisiteCodes("EN-Y3-GR-PRESENT-PERFECT")).toEqual(["EN-Y2-GR-TENSE"]);
	});
});

describe("English generators", () => {
	for (const o of ENGLISH_OBJECTIVES) {
		it(`${o.code}: two item types, unique choices, answer fits the 64 character limit`, () => {
			expect(supportedTypes(o.code)).toEqual(["multiple_choice", "written"]);
			for (const type of supportedTypes(o.code)) {
				for (const item of sample(o.code, type)) {
					expect(item.type).toBe(type);
					expect(item.answer.length).toBeLessThanOrEqual(64);
					expect(item.prompt.length).toBeLessThanOrEqual(500);
					if (type === "multiple_choice") {
						expect(item.choices?.length).toBeGreaterThanOrEqual(3);
						expect(new Set(item.choices).size).toBe(item.choices?.length);
						expect(item.choices).toContain(item.answer);
					} else {
						expect(item.choices).toBeUndefined();
					}
				}
			}
		});
	}

	it("is deterministic for a given seed", () => {
		for (const o of ENGLISH_OBJECTIVES) {
			const a = generateItem(o.code, { rng: createRng(7), difficulty: 2, type: "written", id: "a" });
			const b = generateItem(o.code, { rng: createRng(7), difficulty: 2, type: "written", id: "a" });
			expect(a).toEqual(b);
		}
	});

	it("EN-Y3-SP-PREFIXES: the answer is prefix + root, distractors are not", () => {
		for (const item of sample("EN-Y3-SP-PREFIXES", "multiple_choice")) {
			const w = Y3_PREFIX_WORDS.find((x) => x.word === item.answer);
			expect(w && `${w.prefix}${w.root}`).toBe(item.answer);
			expect(item.choices?.filter((c) => Y3_PREFIX_WORDS.some((x) => x.word === c))).toEqual([item.answer]);
		}
	});

	it("EN-Y5-SP-VERB-PREFIXES: only uses dis–, de–, mis–, over– and re–", () => {
		for (const item of sample("EN-Y5-SP-VERB-PREFIXES", "written")) {
			const w = Y5_PREFIX_WORDS.find((x) => x.word === item.answer);
			expect(["dis", "de", "mis", "over", "re"]).toContain(w?.prefix);
			expect(item.prompt).toContain(`"${w?.root}"`);
		}
	});

	it("EN-Y3-GR-PRESENT-PERFECT: has with one subject, have with many", () => {
		for (const item of sample("EN-Y3-GR-PRESENT-PERFECT", "written")) {
			const [aux, participle] = item.answer.split(" ");
			expect(PERFECT_VERBS.map((v) => v.participle)).toContain(participle);
			const plural = /: (We|They|The children|My friends) /.test(item.prompt);
			expect(aux).toBe(plural ? "have" : "has");
		}
	});

	it("EN-Y3-PU-INVERTED-COMMAS: the end mark sits inside the inverted commas", () => {
		for (const item of sample("EN-Y3-PU-INVERTED-COMMAS", "multiple_choice")) {
			expect(item.answer).toMatch(/^"[^"]+[?!,]" [a-z]+ [A-Z][a-z]+\.$/);
		}
		for (const item of sample("EN-Y3-PU-INVERTED-COMMAS", "written")) {
			expect(item.prompt).not.toContain('"');
		}
	});

	it("EN-Y5-GR-RELATIVE-CLAUSES: the pronoun matches the sentence and the clause starts with it", () => {
		for (const item of sample("EN-Y5-GR-RELATIVE-CLAUSES", "written")) {
			const s = RELATIVE_SENTENCES.find((x) => item.prompt.includes(x.before) && item.prompt.includes(x.after));
			expect(s).toBeDefined();
			if (item.difficulty === 3) expect(item.answer.startsWith(`${s?.pronoun} `)).toBe(true);
			else expect(item.answer).toBe(s?.pronoun);
		}
	});

	it("EN-Y5-GR-POSSIBILITY: exactly one choice belongs to the asked group", () => {
		for (const item of sample("EN-Y5-GR-POSSIBILITY", "multiple_choice")) {
			const group: readonly string[] = item.prompt.includes("certain to happen") ? CERTAIN_WORDS : POSSIBLE_WORDS;
			expect(item.choices?.filter((c) => group.includes(c))).toEqual([item.answer]);
		}
	});
});

describe("written answers", () => {
	const item = (answer: string): Item => ({
		id: "x",
		objectiveCode: "EN-Y3-PU-INVERTED-COMMAS",
		type: "written",
		difficulty: 2,
		prompt: "p",
		answer,
		hint: "",
		workedSolution: "",
	});

	it("ignores case, spacing, curly quotes and a final full stop", () => {
		expect(normaliseText("  “Can we go now?”   asked ELLA.  ")).toBe('"can we go now?" asked ella');
		expect(gradeResponse(item('"Can we go now?" asked Ella.'), "“Can we go now?” asked Ella").correct).toBe(true);
		expect(gradeResponse(item("has finished"), "Has  finished.").correct).toBe(true);
	});

	it("still marks wrong spelling and missing punctuation as wrong", () => {
		expect(gradeResponse(item("impossible"), "inpossible").correct).toBe(false);
		expect(gradeResponse(item('"I am hungry," said Tom.'), '"I am hungry" said Tom.').correct).toBe(false);
		expect(gradeResponse(item("who"), "   ")).toEqual({ correct: false, parsed: false });
	});
});

describe("English lesson", () => {
	for (const code of [...LESSON_OBJECTIVES_BY_YEAR[3], ...LESSON_OBJECTIVES_BY_YEAR[5]].filter((c) =>
		c.startsWith("EN-"),
	)) {
		it(`${code}: a correct independent set reaches secure under the shared mastery policy`, () => {
			let s = startLesson({
				kind: "lesson",
				objectiveCode: code,
				prerequisiteCodes: getPrerequisiteCodes(code),
				seed: code,
			});
			while (s.phase !== "complete") {
				if (s.phase === "instruction") {
					s = continueToPractice(s);
					continue;
				}
				const current = currentItem(s);
				if (!current) throw new Error("no item");
				s = submitAnswer(s, current.answer).state;
			}
			const attempts = s.log
				.filter((e) => e.objectiveCode === code)
				.map((e) => ({ ...e, sessionId: "s1", createdAt: "2026-11-18T10:00:00.000Z" }));
			expect(evaluateMastery(attempts).status).toBe("secure");
		});
	}
});
