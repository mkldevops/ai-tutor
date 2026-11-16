import { describe, expect, it } from "vitest";
import { gradeItem } from "./grade";

describe("gradeItem", () => {
	it.each([
		["735 − 20 =", "715", "correct", null],
		["735 - 20 =", "705", "incorrect", "715"],
		["6 × 7 = ☐", "42", "correct", null],
		["6 x 7 = ___", "43", "incorrect", "42"],
		["6x7=", "42", "correct", null],
		["2,400 + 600 =", "3,000", "correct", null],
		["3.5 + 1.25 =", "4.75", "correct", null],
		["48 ÷ 6 =", "8", "correct", null],
		["☐ + 25 = 100", "75", "correct", null],
		["100 − ☐ = 37", "73", "incorrect", null],
		["12 = 3 × ?", "4", "correct", null],
	])("%s answered %s → %s", (question, answer, verdict, expected) => {
		expect(gradeItem(question, answer)).toEqual({ verdict, expected });
	});

	it.each([
		["Round 347 to the nearest 10", "350"],
		["735 − 20 =", "seven hundred"],
		["735 − 20 =", ""],
		["☐ + ☐ = 10", "5"],
		["3/4 + 1/4 =", "1"],
		["17 ÷ 5 =", "3 r 2"],
		["a + 3 = 5", "2"],
		["7 + 3 = 10 = 5 + 5", "10"],
	])("leaves %s / %s unchecked", (question, answer) => {
		expect(gradeItem(question, answer).verdict).toBe("unchecked");
	});
});
