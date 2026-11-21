import { getPrerequisiteCodes } from "#/curriculum/england-nc";
import { programmeSteps } from "#/curriculum/programme";
import { startLesson } from "#/learning-engine/lesson";
import type { DataStore } from "../store/types";

export async function placeAt(store: DataStore, studentId: string, objectiveCode: string) {
	const student = await store.students.get(studentId);
	if (!student) throw new Error(`unknown student ${studentId}`);
	const steps = programmeSteps(student.yearGroup);
	const target = steps.findIndex((s) => s.objectiveCode === objectiveCode);
	if (target < 0) throw new Error(`${objectiveCode} is not on the Y${student.yearGroup} programme`);
	const existing = new Set((await store.student_competencies.listAll({ studentId })).map((c) => c.objectiveCode));
	for (const step of steps.slice(0, target)) {
		if (existing.has(step.objectiveCode)) continue;
		await store.student_competencies.create({
			familyId: student.familyId,
			studentId,
			objectiveCode: step.objectiveCode,
			status: "secure",
			computedStatus: "secure",
			reasons: ["placed for test"],
			securedAt: null,
			override: null,
		});
	}
}

export async function openLegacySession(store: DataStore, studentId: string, objectiveCode: string) {
	const student = await store.students.get(studentId);
	if (!student) throw new Error(`unknown student ${studentId}`);
	const state = startLesson({
		kind: "lesson",
		objectiveCode,
		prerequisiteCodes: getPrerequisiteCodes(objectiveCode),
		seed: `legacy-${objectiveCode}`,
	});
	return store.learning_sessions.create({
		familyId: student.familyId,
		studentId,
		objectiveCode,
		kind: "lesson",
		phase: state.phase,
		state,
		completedAt: null,
	});
}
