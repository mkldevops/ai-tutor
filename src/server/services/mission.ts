import { getObjective } from "#/curriculum/england-nc";
import { programmeSteps } from "#/curriculum/programme";
import type { Subject } from "#/domain/types";
import { type Mission, todaysMission } from "#/learning-engine/mission";
import { programmePosition } from "#/learning-engine/programme";
import { LESSON_EXPIRY_DAYS } from "../config";
import type { DataStore, LearningSessionRecord, StudentRecord } from "../store/types";
import { type Actor, requireStudent } from "./family";

type Deps = { store: DataStore; now?: () => Date };

export type MissionResponse = Mission & {
	objective: { code: string; title: string; subject: Subject; strand: string } | null;
};

export function isExpiredSession(session: Pick<LearningSessionRecord, "createdAt" | "completedAt">, now: Date) {
	const expiresAt = new Date(session.createdAt).getTime() + LESSON_EXPIRY_DAYS * 24 * 60 * 60_000;
	return session.completedAt === null && now.getTime() >= expiresAt;
}

export async function missionFor(
	store: DataStore,
	student: Pick<StudentRecord, "id" | "yearGroup">,
	now: Date,
): Promise<Mission> {
	const [competencies, pendingReviews, openSessions] = await Promise.all([
		store.student_competencies.listAll({ studentId: student.id }),
		store.revision_schedules.listAll({ studentId: student.id, status: "pending" }),
		store.learning_sessions.listAll({ studentId: student.id, completedAt: null }),
	]);
	return todaysMission({
		position: programmePosition(programmeSteps(student.yearGroup), competencies),
		openSessions: openSessions.filter((s) => !isExpiredSession(s, now)),
		pendingReviews,
		now,
	});
}

export async function getMission(deps: Deps, actor: Actor, studentId: string): Promise<MissionResponse> {
	const student = await requireStudent(deps.store, actor, studentId);
	const mission = await missionFor(deps.store, student, deps.now?.() ?? new Date());
	if (mission.reason === "complete") return { ...mission, objective: null };
	const o = getObjective(mission.objectiveCode);
	return {
		...mission,
		objective: o ? { code: o.code, title: o.title, subject: o.subject, strand: o.strand } : null,
	};
}
