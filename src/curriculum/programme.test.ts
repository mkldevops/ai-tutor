import { describe, expect, it } from "vitest";
import { getObjective, getPrerequisiteCodes, LESSON_OBJECTIVES_BY_YEAR } from "./england-nc";
import { PROGRAMME_BY_YEAR, type ProgrammeYear, programmeSteps, stepOf } from "./programme";

const YEARS: ProgrammeYear[] = [3, 5];

describe.each(YEARS)("Year %i programme", (year) => {
	const units = PROGRAMME_BY_YEAR[year];
	const steps = programmeSteps(year);

	it("contains every lesson objective of the year exactly once", () => {
		const codes = steps.map((s) => s.objectiveCode);
		expect(new Set(codes).size).toBe(codes.length);
		expect([...codes].sort()).toEqual([...LESSON_OBJECTIVES_BY_YEAR[year]].sort());
	});

	it("only uses known objectives of the right year and subject", () => {
		for (const unit of units) {
			for (const code of unit.objectiveCodes) {
				const objective = getObjective(code);
				expect(objective, code).toBeDefined();
				expect(objective?.yearGroup).toBe(year);
				expect(objective?.subject).toBe(unit.subject);
			}
		}
	});

	it("starts with English and alternates subjects between units", () => {
		expect(units[0]?.subject).toBe("english");
		for (let i = 1; i < units.length; i++) {
			expect(units[i]?.subject).not.toBe(units[i - 1]?.subject);
		}
	});

	it("keeps units between two and three objectives", () => {
		for (const unit of units) {
			expect(unit.objectiveCodes.length).toBeGreaterThanOrEqual(2);
			expect(unit.objectiveCodes.length).toBeLessThanOrEqual(3);
		}
	});

	it("places every in-year prerequisite before its dependant", () => {
		for (const step of steps) {
			for (const prerequisite of getPrerequisiteCodes(step.objectiveCode)) {
				const before = stepOf(year, prerequisite);
				if (before) expect(before.index, `${prerequisite} -> ${step.objectiveCode}`).toBeLessThan(step.index);
			}
		}
	});

	it("numbers steps in order with unique unit ids", () => {
		expect(steps.map((s) => s.index)).toEqual(steps.map((_, i) => i));
		expect(new Set(units.map((u) => u.id)).size).toBe(units.length);
	});
});
