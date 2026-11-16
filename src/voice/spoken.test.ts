import { describe, expect, it } from "vitest";
import { firstSpokenNumber, parseSpokenNumber, questionSpeech, toSpeech } from "./spoken";

describe("toSpeech", () => {
	it("reads maths symbols as words", () => {
		expect(toSpeech("36 × 4 = ?")).toBe("36 times 4 equals what?");
		expect(toSpeech("72 ÷ ☐ = 8")).toBe("72 divided by what number equals 8");
		expect(toSpeech("456 − 120 = ?")).toBe("456 minus 120 equals what?");
		expect(toSpeech("3 + ______ = 10")).toBe("3 plus what number equals 10");
	});

	it("leaves word problems untouched", () => {
		const text = "24 chairs are put in 4 equal rows. How many chairs are in each row?";
		expect(toSpeech(text)).toBe(text);
	});
});

describe("parseSpokenNumber", () => {
	it.each([
		["42", "42"],
		["1,000,000", "1000000"],
		["3.5", "3.5"],
		["forty two", "42"],
		["forty-two", "42"],
		["three hundred and twelve", "312"],
		["a hundred", "100"],
		["one thousand two hundred and five", "1205"],
		["two million", "2000000"],
		["three point five", "3.5"],
		["nought point zero seven", "0.07"],
		["the answer is sixty", "60"],
		["it's 7 I think", "7"],
		["minus four", "-4"],
		["twenty to", "22"],
		["zero", "0"],
	])("%s → %s", (spoken, expected) => {
		expect(parseSpokenNumber(spoken)).toBe(expected);
	});

	it("returns null when no number was said", () => {
		expect(parseSpokenNumber("I don't know")).toBeNull();
		expect(parseSpokenNumber("")).toBeNull();
	});

	it("does not read a leading homophone as a number", () => {
		expect(parseSpokenNumber("for real")).toBeNull();
	});
});

describe("firstSpokenNumber", () => {
	it("takes the first alternative that holds a number", () => {
		expect(firstSpokenNumber(["for tea", "forty", "4"])).toBe("40");
		expect(firstSpokenNumber(["hello"])).toBeNull();
	});
});

describe("questionSpeech", () => {
	it("reads the choices after the question", () => {
		expect(questionSpeech({ prompt: "Which of these is a factor of 12?", choices: ["5", "7", "4"] })).toBe(
			"Which of these is a factor of 12? Is it 5, or 7, or 4?",
		);
		expect(questionSpeech({ prompt: "36 × 4 = ?", choices: null })).toBe("36 × 4 = ?");
	});
});
