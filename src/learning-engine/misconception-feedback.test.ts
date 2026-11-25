import { describe, expect, it } from "vitest";
import type { Item } from "#/domain/types";
import { startLesson, submitAnswer } from "./lesson";

const rounding: Item = {
	id: "round",
	objectiveCode: "MA-Y5-PV-ROUND",
	type: "numeric",
	difficulty: 2,
	prompt: "Round 55,933 to the nearest 100.",
	answer: "55,900",
	hint: "Look at the tens digit.",
	workedSolution: "55,933 rounded to the nearest 100 is 55,900.",
};

function answer(item: Item, response: string, phase: "guided" | "independent" | "diagnostic" | "review" = "guided") {
	const state = startLesson({
		kind: "extra",
		objectiveCode: item.objectiveCode,
		prerequisiteCodes: [],
		seed: "support",
	});
	return submitAnswer({ ...state, phase, items: [item] }, response);
}

function powers(prompt: string, expected: string, equation: string): Item {
	return {
		...rounding,
		id: "powers",
		objectiveCode: "MA-Y5-MD-POWERS10",
		prompt,
		answer: expected,
		workedSolution: equation,
	};
}

describe("guided misconception feedback through answer submission", () => {
	it("explains missing higher place values without claiming to know the child's reasoning", () => {
		const result = answer(rounding, "900");
		expect(result.feedback?.message).toContain("whole number, including the thousands");
		expect(result.feedback?.workedSolution).toContain("33 away from 55,900 and 67 away from 56,000");
		expect(result.feedback?.correctAnswer).toBe("55,900");
		expect(result.entry.correct).toBe(false);
	});

	it("points out retained low-order digits and explains the two neighbours", () => {
		const item = { ...rounding, prompt: "Round 385,915 to the nearest 1,000.", answer: "386,000" };
		const { feedback } = answer(item, "386915");
		expect(feedback?.message).toContain("3 zeros");
		expect(feedback?.workedSolution).toContain("915 away from 385,000 and 85 away from 386,000");
	});

	it("explains halfway rounding and accepts formatted correct answers as before", () => {
		const item = { ...rounding, prompt: "Round 1,250 to the nearest 100.", answer: "1,300" };
		expect(answer(item, "1200").feedback?.workedSolution).toContain("halfway, so round up");
		expect(answer(item, " 1,300 ").entry.correct).toBe(true);
	});

	it("makes the decimal point significant when an answer loses it", () => {
		const item = powers("23.7 ÷ 100 = ?", "0.237", "23.7 ÷ 100 = 0.237.");
		const { feedback } = answer(item, "237");
		expect(feedback?.message).toContain("237 and 0.237 are different numbers");
		expect(feedback?.workedSolution).toContain("2 places to the right");
	});

	it("distinguishes wrong direction from the wrong number of places", () => {
		const item = powers(
			"75.2 × 100 = ?",
			"7,520",
			"75.2 × 100 = 7,520. The digits move 2 places; the decimal point stays still.",
		);
		expect(answer(item, "0.752").feedback?.message).toContain("makes this positive number bigger");
		expect(answer(item, "752").feedback?.message).toContain("2 places to the left");
		const division = powers("92.5 ÷ 10 = ?", "9.25", "92.5 ÷ 10 = 9.25.");
		expect(answer(division, "0.925").feedback?.message).toContain("one place to the right");
	});

	it("also supports word problems using their verified solution equation", () => {
		const item = powers(
			"One box holds 48.2 kg of rice. How many kg do 1,000 boxes hold?",
			"48,200",
			"48.2 × 1,000 = 48,200. The digits move 3 places; the decimal point stays still.",
		);
		expect(answer(item, "0.482").feedback?.message).toContain("makes this positive number bigger");
	});

	it("does not confuse a missing factor with the final result", () => {
		const item = { ...powers("75.2 × ☐ = 7,520", "100", "75.2 × 100 = 7,520."), type: "missing_number" as const };
		expect(answer(item, "10").feedback?.workedSolution).toBe(item.workedSolution);
	});

	it.each(["diagnostic", "independent", "review"] as const)("keeps %s feedback hidden", (phase) => {
		const result = answer(rounding, "900", phase);
		expect(result.feedback).toBeNull();
		expect(result.entry.correct).toBe(false);
	});
});
