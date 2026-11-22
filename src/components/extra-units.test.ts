import { describe, expect, it } from "vitest";
import type { Course, CourseStep } from "#/server/services/mission";
import { extraUnits } from "./extra-units";

const step = (code: string, state: CourseStep["state"]): CourseStep => ({
	code,
	title: code,
	strand: "",
	state,
	status: "not_started",
});

const course = (states: CourseStep["state"][][]): Course => ({
	units: states.map((unit, u) => ({
		id: `u${u}`,
		title: `Unit ${u}`,
		subject: "maths",
		steps: unit.map((s, i) => step(`U${u}-S${i}`, s)),
	})),
	done: 0,
	total: states.flat().length,
});

describe("extraUnits", () => {
	it("is empty for a learner with no reached step", () => {
		expect(extraUnits(course([["locked", "locked"], ["locked"]]))).toEqual([]);
	});

	it("keeps reached steps grouped by unit and drops locked steps and empty units", () => {
		const units = extraUnits(course([["done", "skipped", "to_rework"], ["current", "locked"], ["locked"]]));
		expect(units.map((u) => u.id)).toEqual(["u0", "u1"]);
		expect(units[0]?.steps.map((s) => s.code)).toEqual(["U0-S0", "U0-S1", "U0-S2"]);
		expect(units[1]?.steps.map((s) => s.code)).toEqual(["U1-S0"]);
	});
});
