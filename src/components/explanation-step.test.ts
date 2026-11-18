import { describe, expect, it } from "vitest";
import { getObjective } from "#/curriculum/england-nc";
import { splitStep } from "./explanation-step";

describe("splitStep", () => {
	it("lifts a trailing calculation out of the sentence", () => {
		expect(splitStep("When you add or subtract tens, look at the tens digit: 352 + 30 = 382.")).toEqual({
			lead: "When you add or subtract tens, look at the tens digit.",
			figures: ["352 + 30 = 382"],
		});
	});

	it("keeps the sentence and shows every calculation when they sit mid-sentence", () => {
		expect(splitStep("Check your answer with the inverse: if 352 + 30 = 382, then 382 − 30 = 352.")).toEqual({
			lead: "Check your answer with the inverse: if 352 + 30 = 382, then 382 − 30 = 352.",
			figures: ["352 + 30 = 382", "382 − 30 = 352"],
		});
	});

	it("leaves a sentence without a calculation as it is", () => {
		expect(splitStep("352 is 3 hundreds, 5 tens and 2 ones.")).toEqual({
			lead: "352 is 3 hundreds, 5 tens and 2 ones.",
			figures: [],
		});
	});

	it("never produces an empty lead for the curriculum explanations", () => {
		const lines = getObjective("MA-Y3-AS-MENTAL")?.explanation ?? [];
		expect(lines.length).toBeGreaterThan(0);
		for (const line of lines) expect(splitStep(line).lead.length).toBeGreaterThan(1);
	});
});
