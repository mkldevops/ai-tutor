import { getObjective } from "#/curriculum/england-nc";
import { programmeSteps } from "#/curriculum/programme";
import type { Subject } from "#/domain/types";
import { type Mission, todaysMission } from "#/learning-engine/mission";
import { programmePosition } from "#/learning-engine/programme";
import type { DataStore } from "../store/types";
import { type Actor, requireStudent } from "./family";
import { isExpiredSession } from "./learning";

type Deps = { store: DataStore; now?: () => Date };

export type MissionResponse = Mission & {
	objective: { code: string; title: string; subject: Subject; strand: string } | null;
};

export async function getMission(deps: Deps, actor: Actor, studentId: string): Promise<MissionResponse> {
	const { store } = deps;
	const student = await requireStudent(store, actor, studentId);
	const now = deps.now?.() ?? new Date();
	const [competencies, pendingReviews, openSessions] = await Promise.all([
		store.student_competencies.listAll({ studentId }),
		store.revision_schedules.listAll({ studentId, status: "pending" }),
		store.learning_sessions.listAll({ studentId, completedAt: null }),
	]);
	const mission = todaysMission({
		position: programmePosition(programmeSteps(student.yearGroup), competencies),
		openSessions: openSessions.filter((s) => !isExpiredSession(s, now)),
		pendingReviews,
		now,
	});
	if (mission.reason === "complete") return { ...mission, objective: null };
	const o = getObjective(mission.objectiveCode);
	return {
		...mission,
		objective: o ? { code: o.code, title: o.title, subject: o.subject, strand: o.strand } : null,
	};
}
