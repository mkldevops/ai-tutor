import type { StudentPreferences, YearGroup } from "#/domain/types";
import type { DataStore, StudentRecord, TableName } from "../store/types";
import { AppError, notFound } from "./errors";

export type Actor = { userId: string; familyId: string; role: "owner" | "parent" };

export async function audit(
	store: DataStore,
	actor: { userId: string | null; familyId: string | null },
	action: string,
	target: string,
	detail: Record<string, unknown> = {},
) {
	await store.audit_logs.create({
		familyId: actor.familyId,
		actorUserId: actor.userId,
		action,
		target,
		detail,
	});
}

export async function createFamilyForUser(store: DataStore, userId: string, familyName: string): Promise<Actor> {
	const existing = await store.family_members.list({ userId }, { limit: 1 });
	if (existing[0]) throw new AppError("conflict", "User already belongs to a family");
	const family = await store.families.create({ name: familyName, ownerUserId: userId });
	await store.family_members.create({ familyId: family.id, userId, role: "owner" });
	const actor: Actor = { userId, familyId: family.id, role: "owner" };
	await audit(store, actor, "family.create", `families/${family.id}`);
	return actor;
}

export async function resolveActor(store: DataStore, userId: string): Promise<Actor | null> {
	const [member] = await store.family_members.list({ userId }, { limit: 1 });
	return member ? { userId, familyId: member.familyId, role: member.role } : null;
}

export async function requireStudent(store: DataStore, actor: Actor, studentId: string): Promise<StudentRecord> {
	const student = await store.students.get(studentId);
	if (!student || student.familyId !== actor.familyId) throw notFound("Student");
	return student;
}

export async function listStudents(store: DataStore, actor: Actor) {
	return store.students.list({ familyId: actor.familyId });
}

export async function createStudent(
	store: DataStore,
	actor: Actor,
	input: { displayName: string; yearGroup: YearGroup; preferences: StudentPreferences },
) {
	const count = (await store.students.list({ familyId: actor.familyId })).length;
	if (count >= 10) throw new AppError("invalid", "A family can have at most 10 student profiles");
	const student = await store.students.create({ familyId: actor.familyId, ...input });
	await audit(store, actor, "student.create", `students/${student.id}`, { yearGroup: input.yearGroup });
	return student;
}

export async function updateStudent(
	store: DataStore,
	actor: Actor,
	studentId: string,
	patch: Partial<{ displayName: string; yearGroup: YearGroup; preferences: StudentPreferences }>,
) {
	await requireStudent(store, actor, studentId);
	const student = await store.students.update(studentId, patch);
	await audit(store, actor, "student.update", `students/${studentId}`, { fields: Object.keys(patch) });
	return student;
}

export async function setStudentVoice(store: DataStore, actor: Actor, studentId: string, enabled: boolean) {
	const student = await requireStudent(store, actor, studentId);
	const preferences = { ...student.preferences, voice: enabled };
	await store.students.update(studentId, { preferences });
	await audit(store, actor, "student.voice", `students/${studentId}`, { enabled });
	return preferences;
}

const STUDENT_OWNED: TableName[] = [
	"learning_sessions",
	"assessment_attempts",
	"student_competencies",
	"mastery_events",
	"revision_schedules",
	"worksheet_checks",
];

export async function exportStudentData(store: DataStore, actor: Actor, studentId: string) {
	const student = await requireStudent(store, actor, studentId);
	const data: Record<string, unknown> = { student };
	for (const table of STUDENT_OWNED) {
		data[table] = await (store[table] as DataStore["assessment_attempts"]).list({ studentId }, { limit: 500 });
	}
	await audit(store, actor, "student.export", `students/${studentId}`);
	return data;
}

export async function deleteStudent(store: DataStore, actor: Actor, studentId: string) {
	await requireStudent(store, actor, studentId);
	for (const table of STUDENT_OWNED) {
		const t = store[table] as DataStore["assessment_attempts"];
		for (;;) {
			const rows = await t.list({ studentId }, { limit: 100 });
			if (rows.length === 0) break;
			for (const r of rows) await t.delete(r.id);
		}
	}
	await store.students.delete(studentId);
	await audit(store, actor, "student.delete", `students/${studentId}`);
}
