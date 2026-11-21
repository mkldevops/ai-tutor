import { getObjective } from "#/curriculum/england-nc";
import { PROGRAMME_BY_YEAR, programmeSteps } from "#/curriculum/programme";
import type { Subject } from "#/domain/types";
import { type Rate, rate } from "#/learning-engine/longitudinal";
import { DEFAULT_POLICY, type MasteryPolicy, summariseSessions } from "#/learning-engine/mastery";
import { countFailedAssessments, programmePosition, type StepPosition } from "#/learning-engine/programme";
import type { DataStore } from "../store/types";
import { type Actor, requireStudent } from "./family";
import { getStudentOutcomes, OUTCOMES_MAX_ROWS } from "./longitudinal";

type Deps = { store: DataStore; now?: () => Date; policy?: MasteryPolicy; maxRows?: number };

const DAY_MS = 86_400_000;
export const MISSION_WINDOW_DAYS = 7;
export const NEXT_STEPS = 3;

export type ReworkReason = "needs_review" | "regression" | "stuck" | "overdue_review";

export type ReportStep = { code: string; title: string; unitId: string; index: number };

export type ProgrammeReport = {
	student: { id: string; displayName: string; yearGroup: number };
	position: {
		unit: { id: string; title: string; subject: Subject; number: number; total: number } | null;
		step: (ReportStep & { number: number; total: number }) | null;
		done: number;
		total: number;
		progress: Rate;
		complete: boolean;
		stuck: boolean;
		failedAssessments: number;
	};
	acquired: (ReportStep & { securedAt: string | null })[];
	toRework: (ReportStep & {
		reasons: ReworkReason[];
		regressions: number;
		daysOverdue: number | null;
		failedAssessments: number;
	})[];
	next: ReportStep[];
	passRate: Rate;
	lastActivityAt: string | null;
	missionsLast7Days: number;
	truncated: boolean;
};

const reportStep = (s: StepPosition): ReportStep => ({
	code: s.objectiveCode,
	title: getObjective(s.objectiveCode)?.title ?? s.objectiveCode,
	unitId: s.unitId,
	index: s.index,
});

export async function getProgrammeReport(deps: Deps, actor: Actor, studentId: string): Promise<ProgrammeReport> {
	const { store } = deps;
	const student = await requireStudent(store, actor, studentId);
	const now = deps.now?.() ?? new Date();
	const policy = deps.policy ?? DEFAULT_POLICY;
	const scope = { studentId: student.id, familyId: actor.familyId };
	const max = deps.maxRows ?? OUTCOMES_MAX_ROWS;

	const [outcomes, competencies, sessions, latestAttempt] = await Promise.all([
		getStudentOutcomes({ ...deps, now: () => now, policy }, actor, student.id),
		store.student_competencies.listAll(scope),
		store.learning_sessions.listLatest(scope, max),
		store.assessment_attempts.list(scope, { limit: 1, latest: true }),
	]);

	const sequence = programmeSteps(student.yearGroup);
	const draft = programmePosition(sequence, competencies);
	const currentCode = draft.current?.objectiveCode;
	const failed = currentCode
		? countFailedAssessments(
				summariseSessions(
					(await store.assessment_attempts.listAll({ ...scope, objectiveCode: currentCode })).map((a) => ({
						sessionId: a.sessionId,
						mode: a.mode,
						itemType: a.itemType,
						correct: a.correct,
						hintsUsed: a.hintsUsed,
						createdAt: a.createdAt,
					})),
				),
				policy,
			)
		: 0;
	const statusOf = new Map(competencies.map((c) => [c.objectiveCode, c.status]));
	const stepCompetencies = [...new Set([...statusOf.keys(), ...(currentCode ? [currentCode] : [])])].map((code) => ({
		objectiveCode: code,
		status: statusOf.get(code) ?? ("not_started" as const),
		failedAssessments: code === currentCode ? failed : 0,
	}));
	const position = programmePosition(sequence, stepCompetencies);

	const units = PROGRAMME_BY_YEAR[student.yearGroup];
	const current = position.current;
	const unit = current ? units[current.unitIndex] : undefined;
	const securedAtOf = new Map(competencies.map((c) => [c.objectiveCode, c.securedAt]));
	const longitudinalOf = new Map(outcomes.objectives.map((o) => [o.objectiveCode, o]));

	const toRework = position.steps.flatMap((s) => {
		const lon = longitudinalOf.get(s.objectiveCode);
		const isCurrent = s.objectiveCode === current?.objectiveCode;
		const reasons: ReworkReason[] = [];
		if (s.state === "to_rework") reasons.push("needs_review");
		if (lon && lon.regressions > 0 && s.state !== "done") reasons.push("regression");
		if (isCurrent && position.stuck) reasons.push("stuck");
		if (lon?.nextReview?.overdue) reasons.push("overdue_review");
		if (reasons.length === 0) return [];
		return [
			{
				...reportStep(s),
				reasons,
				regressions: lon?.regressions ?? 0,
				daysOverdue: lon?.nextReview?.overdue ? lon.nextReview.daysOverdue : null,
				failedAssessments: isCurrent ? failed : 0,
			},
		];
	});

	const since = now.getTime() - MISSION_WINDOW_DAYS * DAY_MS;
	const missionsLast7Days = sessions.rows.filter((s) => {
		if (!s.completedAt) return false;
		const at = Date.parse(s.completedAt);
		return at > since && at <= now.getTime();
	}).length;

	return {
		student: outcomes.student,
		position: {
			unit:
				current && unit
					? {
							id: unit.id,
							title: unit.title,
							subject: unit.subject,
							number: current.unitIndex + 1,
							total: units.length,
						}
					: null,
			step: current ? { ...reportStep(current), number: current.index + 1, total: position.counts.total } : null,
			done: position.counts.done,
			total: position.counts.total,
			progress: rate(position.counts.done, position.counts.total),
			complete: position.complete,
			stuck: position.stuck,
			failedAssessments: failed,
		},
		acquired: position.steps
			.filter((s) => s.state === "done")
			.map((s) => ({
				...reportStep(s),
				securedAt: securedAtOf.get(s.objectiveCode) ?? longitudinalOf.get(s.objectiveCode)?.securedAt ?? null,
			})),
		toRework,
		next: position.steps
			.filter((s) => s.state === "current" || s.state === "locked")
			.slice(0, NEXT_STEPS)
			.map(reportStep),
		passRate: outcomes.passRate,
		lastActivityAt: latestAttempt[0]?.createdAt ?? null,
		missionsLast7Days,
		truncated: outcomes.truncated || sessions.truncated,
	};
}
