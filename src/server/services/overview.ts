import { PROGRAMME_BY_YEAR } from "#/curriculum/programme";
import type { CompetencyStatus, YearGroup } from "#/domain/types";
import { OVERDUE_AFTER_DAYS } from "#/learning-engine/longitudinal";
import type { Pace } from "#/learning-engine/pace";
import type { DataStore } from "../store/types";
import type { Actor } from "./family";
import { allowedObjectives } from "./learning";
import { OUTCOMES_MAX_ROWS } from "./longitudinal";
import { paceOf, programmeStanding } from "./programme-report";

const DAY_MS = 86_400_000;
const DONE: CompetencyStatus[] = ["secure", "mastered"];
export const INACTIVE_AFTER_DAYS = 7;

export type AttentionFlag = "stuck" | "overdue_reviews" | "inactive";

export type OverviewPosition = {
	unit: { number: number; total: number } | null;
	step: { number: number; total: number } | null;
	complete: boolean;
};

export type LearnerOverview = {
	id: string;
	displayName: string;
	yearGroup: YearGroup;
	objectives: number;
	secure: number;
	inProgress: number;
	reviewsDue: number;
	nextReviewAt: string | null;
	lastActiveAt: string | null;
	week: { answers: number; correct: number };
	position: OverviewPosition;
	overdueReviews: number;
	attention: AttentionFlag[];
	pace: Pace;
};

export async function getFamilyOverview(
	deps: { store: DataStore; now?: () => Date },
	actor: Actor,
): Promise<LearnerOverview[]> {
	const { store } = deps;
	const now = (deps.now?.() ?? new Date()).getTime();
	const students = await store.students.list({ familyId: actor.familyId });
	return Promise.all(
		students.map(async (s) => {
			const codes = new Set(allowedObjectives(s.yearGroup));
			const [competencies, schedules, attempts, sessions] = await Promise.all([
				store.student_competencies.list({ studentId: s.id, familyId: actor.familyId }),
				store.revision_schedules.list({ studentId: s.id, familyId: actor.familyId, status: "pending" }),
				store.assessment_attempts.list({ studentId: s.id, familyId: actor.familyId }, { limit: 500, latest: true }),
				store.learning_sessions.listLatest({ studentId: s.id, familyId: actor.familyId }, OUTCOMES_MAX_ROWS),
			]);
			const scope = { studentId: s.id, familyId: actor.familyId };
			const { position } = await programmeStanding(store, scope, s.yearGroup, competencies);
			const comps = competencies.filter((c) => codes.has(c.objectiveCode));
			const pending = schedules.filter((r) => codes.has(r.objectiveCode));
			const week = attempts.filter((a) => now - Date.parse(a.createdAt) < 7 * DAY_MS);
			const upcoming = pending
				.map((r) => r.dueAt)
				.filter((d) => Date.parse(d) > now)
				.sort();
			const lastActiveAt =
				attempts
					.map((a) => a.createdAt)
					.sort()
					.at(-1) ?? null;
			const overdueReviews = pending.filter(
				(r) => Math.floor((now - Date.parse(r.dueAt)) / DAY_MS) >= OVERDUE_AFTER_DAYS,
			).length;
			const idleSince = Date.parse(lastActiveAt ?? s.createdAt);
			const attention: AttentionFlag[] = [];
			if (position.stuck) attention.push("stuck");
			if (overdueReviews > 0) attention.push("overdue_reviews");
			if (now - idleSince >= INACTIVE_AFTER_DAYS * DAY_MS) attention.push("inactive");
			const current = position.current;
			return {
				id: s.id,
				displayName: s.displayName,
				yearGroup: s.yearGroup,
				objectives: codes.size,
				secure: comps.filter((c) => DONE.includes(c.status)).length,
				inProgress: comps.filter((c) => !DONE.includes(c.status) && c.status !== "not_started").length,
				reviewsDue: pending.filter((r) => Date.parse(r.dueAt) <= now).length,
				nextReviewAt: upcoming[0] ?? null,
				lastActiveAt,
				week: { answers: week.length, correct: week.filter((a) => a.correct).length },
				position: {
					unit: current ? { number: current.unitIndex + 1, total: PROGRAMME_BY_YEAR[s.yearGroup].length } : null,
					step: current ? { number: current.index + 1, total: position.counts.total } : null,
					complete: position.complete,
				},
				overdueReviews,
				attention,
				pace: paceOf(s, position, sessions.rows, new Date(now)),
			};
		}),
	);
}
