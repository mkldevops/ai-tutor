import { describe, expect, it } from "vitest";
import { numberLineFor, promptParts } from "./missing-number";

describe("promptParts", () => {
	it("splits the prompt around the blank", () => {
		expect(promptParts("888 − ☐ = 885")).toEqual([
			{ blank: false, text: "888 − " },
			{ blank: true },
			{ blank: false, text: " = 885" },
		]);
	});

	it("handles a trailing blank", () => {
		expect(promptParts("50, 100, 150, ☐")).toEqual([{ blank: false, text: "50, 100, 150, " }, { blank: true }]);
	});

	it("keeps a prompt without blank whole", () => {
		expect(promptParts("3 × 4 = ?")).toEqual([{ blank: false, text: "3 × 4 = ?" }]);
	});
});

describe("numberLineFor", () => {
	it("marks both known numbers on a line of ones for a ones change", () => {
		expect(numberLineFor("888 − ☐ = 885")).toEqual({ from: 884, to: 889, step: 1, start: 888, marks: [888, 885] });
	});

	it("uses tens for a tens change, anchored on the known numbers", () => {
		expect(numberLineFor("345 + ☐ = 415")).toEqual({ from: 335, to: 425, step: 10, start: 345, marks: [345, 415] });
	});

	it("uses hundreds for a hundreds change", () => {
		expect(numberLineFor("1,200 + ☐ = 1,700")).toMatchObject({ from: 1100, to: 1800, step: 100 });
	});

	it("picks the step that leaves graduations to count", () => {
		expect(numberLineFor("899 + ☐ = 999")).toMatchObject({ from: 889, to: 1009, step: 10 });
		expect(numberLineFor("50 + ☐ = 60")).toMatchObject({ step: 1 });
		expect(numberLineFor("400 − ☐ = 100")).toMatchObject({ step: 100 });
	});

	it("never starts below zero", () => {
		expect(numberLineFor("3 − ☐ = 0")?.from).toBe(0);
	});

	it("skips lines with too many graduations", () => {
		expect(numberLineFor("10 + ☐ = 47")).toBeNull();
	});

	it("skips prompts that are not a missing addend", () => {
		expect(numberLineFor("3 × ☐ = 12")).toBeNull();
		expect(numberLineFor("50, 100, 150, ☐")).toBeNull();
		expect(numberLineFor("5 + 3 = ?")).toBeNull();
	});
});
