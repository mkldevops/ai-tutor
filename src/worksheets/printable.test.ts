import { describe, expect, it } from "vitest";
import { gradeItem } from "./grade";
import { BLANK_LINE, buildPrintableItems, difficultyFor, LETTERS, toPaperPrompt } from "./printable";

describe("printable worksheets", () => {
	it("is deterministic for the same seed and varies with the seed", () => {
		const args = { objectiveCode: "MA-Y3-AS-MENTAL", difficulty: 2 as const, count: 10, seed: "abcd-1234" };
		expect(buildPrintableItems(args)).toEqual(buildPrintableItems(args));
		expect(buildPrintableItems({ ...args, seed: "other-seed" })).not.toEqual(buildPrintableItems(args));
	});

	it("numbers items and turns question marks and boxes into answer lines", () => {
		const items = buildPrintableItems({ objectiveCode: "MA-Y5-MD-POWERS10", difficulty: 3, count: 8, seed: "s-1" });
		expect(items.map((i) => i.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
		for (const i of items.filter((x) => x.type !== "word_problem")) {
			expect(i.prompt).toContain(BLANK_LINE);
			expect(i.prompt).not.toMatch(/[?☐]/);
		}
	});

	it("keeps answers consistent with the deterministic grader", () => {
		for (const objectiveCode of ["MA-Y2-AS-MENTAL", "MA-Y3-AS-MENTAL", "MA-Y4-FR-DIV10-100", "MA-Y5-MD-POWERS10"]) {
			const items = buildPrintableItems({ objectiveCode, difficulty: 2, count: 12, seed: "grade" });
			for (const i of items.filter((x) => x.type === "numeric" || x.type === "missing_number")) {
				expect(gradeItem(i.prompt, i.answer).verdict).toBe("correct");
			}
		}
	});

	it("avoids repeated questions and labels multiple-choice answers with their letter", () => {
		for (const seed of ["a-1", "b-2", "c-3", "d-4"]) {
			const items = buildPrintableItems({ objectiveCode: "MA-Y5-MD-POWERS10", difficulty: 1, count: 20, seed });
			const sums = items.map((i) => i.workedSolution.split(". ")[0]);
			expect(new Set(sums).size).toBe(sums.length);
			for (const i of items.filter((x) => x.choices)) {
				const [letter, value] = i.answer.split(") ");
				expect(i.choices?.[LETTERS.indexOf(letter as string)]).toBe(value);
			}
		}
	});

	it("leaves word problems unchanged", () => {
		expect(toPaperPrompt({ type: "word_problem", prompt: "How many are left?" })).toBe("How many are left?");
	});

	it("maps progress to a level", () => {
		expect(difficultyFor("not_started")).toBe(1);
		expect(difficultyFor("emerging")).toBe(1);
		expect(difficultyFor("developing")).toBe(2);
		expect(difficultyFor("needs_review")).toBe(2);
		expect(difficultyFor("secure")).toBe(3);
		expect(difficultyFor("mastered")).toBe(3);
	});
});
