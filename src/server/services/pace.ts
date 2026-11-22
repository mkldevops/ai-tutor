import { programmeSettingsSchema } from "#/domain/types";
import type { DataStore } from "../store/types";
import { type Actor, audit, requireStudent } from "./family";
import { programmeSettingsOf } from "./programme-settings";

export async function setPaceTarget(store: DataStore, actor: Actor, studentId: string, paceTarget: number) {
	const student = await requireStudent(store, actor, studentId);
	const current = programmeSettingsOf(student);
	const programme = programmeSettingsSchema.parse({ ...current, paceTarget });
	await store.students.update(studentId, { programme });
	await audit(store, actor, "programme.pace", `students/${studentId}`, { from: current.paceTarget, to: paceTarget });
	return programme;
}
