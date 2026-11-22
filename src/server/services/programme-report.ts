import { getObjective } from "#/curriculum/england-nc";
import { PROGRAMME_BY_YEAR, programmeSteps } from "#/curriculum/programme";
import type { CompetencyStatus, Subject, YearGroup } from "#/domain/types";
import { type Rate, rate } from "#/learning-engine/longitudinal";
import { DEFAULT_POLICY, type MasteryPolicy, summariseSessions } from "#/learning-engine/mastery";
import { deferredReviews, dueReviews } from "#/learning-engine/mission";
import { countMissions, type Pace, type PaceSession, projectPace } from "#/learning-engine/pace";
import {
	countFailedAssessments,
	type ProgrammePosition,
	programmePosition,
	type StepPosition,
} from "#/learning-engine/programme";
import type { DataStore, LearningSessionRecord, StudentRecord } from "../store/types";
import { type Actor, requireStudent } from "./family";
import { getStudentOutcomes, OUTCOMES_MAX_ROWS } from "./longitudinal";
import { recentMissions } from "./mission";
import { programmeSettingsOf } from "./programme-settings";

type Deps = { store: DataStore; now?: () => Date; policy?: MasteryPolicy; maxRows?: number };

export const NEXT_STEPS = 3;

export type ReworkReason = "needs_review" | "regression" | "stuck" | "overdue_review";

export type ReportStep = { code: string; title: string; unitId: string; index: number };

export type ReportUnit = {
	id: string;
	title: string;
	subject: Subject;
	number: number;
	done: number;
	total: number;
	current: boolean;
};

export type ExtraPractice = {
	sessions: number;
	objectives: { code: string; title: string; sessions: number }[];
	accuracy: Rate;
};

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
	reviewBacklog: { due: number; deferred: number };
	extras: ExtraPractice;
	pace: Pace;
	truncated: boolean;
	units: ReportUnit[];
};

const reportStep = (s: StepPosition): ReportStep => ({
	code: s.objectiveCode,
	title: getObjective(s.objectiveCode)?.title ?? s.objectiveCode,
	unitId: s.unitId,
	index: s.index,
});

async function failedAssessmentsOn(
	store: DataStore,
	scope: { studentId: string; familyId: string },
	objectiveCode: string,
	policy: MasteryPolicy,
): Promise<number> {
	const [sessions, attempts] = await Promise.all([
		store.learning_sessions.listAll({ ...scope, objectiveCode }),
		store.assessment_attempts.listAll({ ...scope, objectiveCode }),
	]);
	const completed = new Set(sessions.filter((s) => s.completedAt !== null).map((s) => s.id));
	return countFailedAssessments(summariseSessions(attempts.filter((a) => completed.has(a.sessionId))), policy);
}

export async function programmeStanding(
	store: DataStore,
	scope: { studentId: string; familyId: string },
	yearGroup: YearGroup,
	competencies: readonly { objectiveCode: string; status: CompetencyStatus }[],
	policy: MasteryPolicy = DEFAULT_POLICY,
): Promise<{ position: ProgrammePosition; failed: number }> {
	const sequence = programmeSteps(yearGroup);
	const currentCode = programmePosition(sequence, competencies).current?.objectiveCode;
	const failed = currentCode ? await failedAssessmentsOn(store, scope, currentCode, policy) : 0;
	const statusOf = new Map(competencies.map((c) => [c.objectiveCode, c.status]));
	const stepCompetencies = [...new Set([...statusOf.keys(), ...(currentCode ? [currentCode] : [])])].map((code) => ({
		objectiveCode: code,
		status: statusOf.get(code) ?? ("not_started" as const),
		failedAssessments: code === currentCode ? failed : 0,
	}));
	return { position: programmePosition(sequence, stepCompetencies), failed };
}

export function paceOf(
	student: Pick<StudentRecord, "programme" | "createdAt">,
	position: ProgrammePosition,
	sessions: readonly PaceSession[],
	now: Date,
): Pace {
	const settings = programmeSettingsOf(student);
	const { current, locked, to_rework, done } = position.counts;
	return projectPace({
		target: settings.paceTarget,
		paused: settings.paused,
		sessions,
		stepsRemaining: current + locked + to_rework,
		stepsDone: done,
		startedAt: student.createdAt,
		now,
	});
}

async function extraPractice(
	store: DataStore,
	scope: { studentId: string; familyId: string },
	order: readonly string[],
	sessions: readonly LearningSessionRecord[],
): Promise<ExtraPractice> {
	const extras = sessions.filter((s) => s.kind === "extra" && s.completedAt !== null);
	const attempts = (
		await Promise.all(extras.map((s) => store.assessment_attempts.listAll({ ...scope, sessionId: s.id })))
	).flat();
	const rank = (code: string) => (order.includes(code) ? order.indexOf(code) : order.length);
	const perObjective = new Map<string, number>();
	for (const s of extras) perObjective.set(s.objectiveCode, (perObjective.get(s.objectiveCode) ?? 0) + 1);
	return {
		sessions: extras.length,
		objectives: [...perObjective]
			.sort(([a], [b]) => rank(a) - rank(b))
			.map(([code, count]) => ({
				code,
				title: getObjective(code)?.title ?? code,
				sessions: count,
			})),
		accuracy: rate(attempts.filter((a) => a.correct).length, attempts.length),
	};
}

export async function getProgrammeReport(deps: Deps, actor: Actor, studentId: string): Promise<ProgrammeReport> {
	const { store } = deps;
	const student = await requireStudent(store, actor, studentId);
	const now = deps.now?.() ?? new Date();
	const policy = deps.policy ?? DEFAULT_POLICY;
	const scope = { studentId: student.id, familyId: actor.familyId };
	const max = deps.maxRows ?? OUTCOMES_MAX_ROWS;

	const [outcomes, competencies, sessions, latestAttempt, pendingReviews, recent] = await Promise.all([
		getStudentOutcomes({ ...deps, now: () => now, policy }, actor, student.id),
		store.student_competencies.listAll(scope),
		store.learning_sessions.listLatest(scope, max),
		store.assessment_attempts.list(scope, { limit: 1, latest: true }),
		store.revision_schedules.listAll({ ...scope, status: "pending" }),
		recentMissions(store, student),
	]);

	const [{ position, failed }, extras] = await Promise.all([
		programmeStanding(store, scope, student.yearGroup, competencies, policy),
		extraPractice(
			store,
			scope,
			programmeSteps(student.yearGroup).map((s) => s.objectiveCode),
			sessions.rows,
		),
	]);

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

	const missionsLast7Days = countMissions(sessions.rows, now);

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
		reviewBacklog: {
			due: dueReviews(position, pendingReviews, now).length,
			deferred: deferredReviews({ position, pendingReviews, recentMissions: recent, now }),
		},
		extras,
		pace: paceOf(student, position, sessions.rows, now),
		truncated: outcomes.truncated || sessions.truncated,
		units: units.map((u, i) => {
			const own = position.steps.filter((s) => s.unitIndex === i);
			return {
				id: u.id,
				title: u.title,
				subject: u.subject,
				number: i + 1,
				done: own.filter((s) => s.state === "done").length,
				total: own.length,
				current: current?.unitIndex === i,
			};
		}),
	};
}
