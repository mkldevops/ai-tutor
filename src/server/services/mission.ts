import { getObjective } from "#/curriculum/england-nc";
import { PROGRAMME_BY_YEAR, programmeSteps } from "#/curriculum/programme";
import type { CompetencyStatus, Subject } from "#/domain/types";
import { type CompletedMission, MISSION_HISTORY_WINDOW, type Mission, todaysMission } from "#/learning-engine/mission";
import { type ProgrammePosition, programmePosition, type StepState } from "#/learning-engine/programme";
import { LESSON_EXPIRY_DAYS } from "../config";
import type { DataStore, LearningSessionRecord, StudentRecord } from "../store/types";
import { type Actor, requireStudent } from "./family";

type Deps = { store: DataStore; now?: () => Date };

export type CourseStep = {
	code: string;
	title: string;
	strand: string;
	state: StepState;
	status: CompetencyStatus;
};

export type CourseUnit = { id: string; title: string; subject: Subject; steps: CourseStep[] };

export type Course = { units: CourseUnit[]; done: number; total: number };

export type MissionResponse = Mission & {
	objective: { code: string; title: string; subject: Subject; strand: string } | null;
	course: Course;
};

export function isExpiredSession(session: Pick<LearningSessionRecord, "createdAt" | "completedAt">, now: Date) {
	const expiresAt = new Date(session.createdAt).getTime() + LESSON_EXPIRY_DAYS * 24 * 60 * 60_000;
	return session.completedAt === null && now.getTime() >= expiresAt;
}

export async function recentMissions(
	store: DataStore,
	student: Pick<StudentRecord, "id">,
): Promise<CompletedMission[]> {
	const { rows } = await store.learning_sessions.listLatest({ studentId: student.id }, MISSION_HISTORY_WINDOW);
	return rows.flatMap((s) => (s.completedAt ? [{ kind: s.kind, completedAt: s.completedAt }] : []));
}

async function missionContext(store: DataStore, student: Pick<StudentRecord, "id" | "yearGroup">, now: Date) {
	const [competencies, pendingReviews, openSessions, recent] = await Promise.all([
		store.student_competencies.listAll({ studentId: student.id }),
		store.revision_schedules.listAll({ studentId: student.id, status: "pending" }),
		store.learning_sessions.listAll({ studentId: student.id, completedAt: null }),
		recentMissions(store, student),
	]);
	const position = programmePosition(programmeSteps(student.yearGroup), competencies);
	const mission = todaysMission({
		position,
		openSessions: openSessions.filter((s) => s.kind !== "extra" && !isExpiredSession(s, now)),
		pendingReviews,
		recentMissions: recent,
		now,
	});
	const statuses = new Map(competencies.map((c) => [c.objectiveCode, c.status]));
	return { mission, position, statuses };
}

export async function missionFor(
	store: DataStore,
	student: Pick<StudentRecord, "id" | "yearGroup">,
	now: Date,
): Promise<{ mission: Mission; position: ProgrammePosition }> {
	const { mission, position } = await missionContext(store, student, now);
	return { mission, position };
}

export function isReachedStep(position: ProgrammePosition, objectiveCode: string): boolean {
	const step = position.steps.find((s) => s.objectiveCode === objectiveCode);
	return step !== undefined && step.state !== "locked";
}

function courseOf(
	yearGroup: StudentRecord["yearGroup"],
	position: ProgrammePosition,
	statuses: ReadonlyMap<string, CompetencyStatus>,
): Course {
	const states = new Map(position.steps.map((s) => [s.objectiveCode, s.state]));
	const units = PROGRAMME_BY_YEAR[yearGroup].map((unit) => ({
		id: unit.id,
		title: unit.title,
		subject: unit.subject,
		steps: unit.objectiveCodes.map((code) => {
			const o = getObjective(code);
			return {
				code,
				title: o?.title ?? code,
				strand: o?.strand ?? "",
				state: states.get(code) ?? "locked",
				status: statuses.get(code) ?? "not_started",
			};
		}),
	}));
	return { units, done: position.counts.done, total: position.counts.total };
}

export async function getMission(deps: Deps, actor: Actor, studentId: string): Promise<MissionResponse> {
	const student = await requireStudent(deps.store, actor, studentId);
	const { mission, position, statuses } = await missionContext(deps.store, student, deps.now?.() ?? new Date());
	const course = courseOf(student.yearGroup, position, statuses);
	if (mission.reason === "complete") return { ...mission, objective: null, course };
	const o = getObjective(mission.objectiveCode);
	return {
		...mission,
		objective: o ? { code: o.code, title: o.title, subject: o.subject, strand: o.strand } : null,
		course,
	};
}
