import type { Course, CourseUnit } from "#/server/services/mission";

export function extraUnits(course: Course): CourseUnit[] {
	return course.units
		.map((unit) => ({ ...unit, steps: unit.steps.filter((s) => s.state !== "locked") }))
		.filter((unit) => unit.steps.length > 0);
}
