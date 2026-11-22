import { programmeSteps } from "#/curriculum/programme";
import { PROGRAMME_SKIP_REASON_MAX, type ProgrammeSettings } from "#/domain/types";
import { programmePosition } from "#/learning-engine/programme";
import type { DataStore, StudentRecord } from "../store/types";
import { AppError } from "./errors";
import { type Actor, audit, requireStudent } from "./family";
import { programmeSettingsOf } from "./programme-settings";

type Deps = { store: DataStore; now?: () => Date };

export const MAX_PROGRAMME_SKIPS = 50;

async function save(store: DataStore, student: StudentRecord, settings: ProgrammeSettings) {
	await store.students.update(student.id, { programme: settings });
	return settings;
}

export async function setProgrammePaused(deps: Deps, actor: Actor, studentId: string, paused: boolean) {
	const { store } = deps;
	const student = await requireStudent(store, actor, studentId);
	const settings = programmeSettingsOf(student);
	if (settings.paused === paused) return settings;
	const saved = await save(store, student, { ...settings, paused });
	await audit(store, actor, paused ? "programme.pause" : "programme.resume", `students/${student.id}`);
	return saved;
}

export async function skipProgrammeStep(
	deps: Deps,
	actor: Actor,
	input: { studentId: string; objectiveCode: string; reason: string },
) {
	const { store } = deps;
	const reason = input.reason.trim();
	if (reason.length === 0 || reason.length > PROGRAMME_SKIP_REASON_MAX) {
		throw new AppError("invalid", `Give a reason of at most ${PROGRAMME_SKIP_REASON_MAX} characters.`);
	}
	const student = await requireStudent(store, actor, input.studentId);
	const settings = programmeSettingsOf(student);
	if (settings.skips.some((s) => s.objectiveCode === input.objectiveCode)) {
		throw new AppError("conflict", "This step is already skipped.");
	}
	if (settings.skips.length >= MAX_PROGRAMME_SKIPS) {
		throw new AppError("invalid", "Too many skipped steps. Undo one first.");
	}
	const competencies = await store.student_competencies.listAll({ studentId: student.id });
	const position = programmePosition(
		programmeSteps(student.yearGroup),
		competencies,
		settings.skips.map((s) => s.objectiveCode),
	);
	if (position.current?.objectiveCode !== input.objectiveCode) {
		throw new AppError("invalid", "Only the current step can be skipped.");
	}
	const at = (deps.now?.() ?? new Date()).toISOString();
	const skip = { objectiveCode: input.objectiveCode, reason, byUserId: actor.userId, at };
	const saved = await save(store, student, { ...settings, skips: [...settings.skips, skip] });
	await audit(store, actor, "programme.skip", `students/${student.id}`, {
		objectiveCode: input.objectiveCode,
		reason,
	});
	return saved;
}

export async function undoProgrammeSkip(deps: Deps, actor: Actor, input: { studentId: string; objectiveCode: string }) {
	const { store } = deps;
	const student = await requireStudent(store, actor, input.studentId);
	const settings = programmeSettingsOf(student);
	const skip = settings.skips.find((s) => s.objectiveCode === input.objectiveCode);
	if (!skip) throw new AppError("invalid", "This step is not skipped.");
	const saved = await save(store, student, {
		...settings,
		skips: settings.skips.filter((s) => s.objectiveCode !== input.objectiveCode),
	});
	await audit(store, actor, "programme.skip_undo", `students/${student.id}`, {
		objectiveCode: input.objectiveCode,
		skippedAt: skip.at,
	});
	return saved;
}
