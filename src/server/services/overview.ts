import type { CompetencyStatus, YearGroup } from "#/domain/types";
import type { DataStore } from "../store/types";
import type { Actor } from "./family";
import { allowedObjectives } from "./learning";

const DAY_MS = 86_400_000;
const DONE: CompetencyStatus[] = ["secure", "mastered"];

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
			const [competencies, schedules, attempts] = await Promise.all([
				store.student_competencies.list({ studentId: s.id, familyId: actor.familyId }),
				store.revision_schedules.list({ studentId: s.id, familyId: actor.familyId, status: "pending" }),
				store.assessment_attempts.list({ studentId: s.id, familyId: actor.familyId }, { limit: 500 }),
			]);
			const comps = competencies.filter((c) => codes.has(c.objectiveCode));
			const pending = schedules.filter((r) => codes.has(r.objectiveCode));
			const week = attempts.filter((a) => now - Date.parse(a.createdAt) < 7 * DAY_MS);
			const upcoming = pending
				.map((r) => r.dueAt)
				.filter((d) => Date.parse(d) > now)
				.sort();
			return {
				id: s.id,
				displayName: s.displayName,
				yearGroup: s.yearGroup,
				objectives: codes.size,
				secure: comps.filter((c) => DONE.includes(c.status)).length,
				inProgress: comps.filter((c) => !DONE.includes(c.status) && c.status !== "not_started").length,
				reviewsDue: pending.filter((r) => Date.parse(r.dueAt) <= now).length,
				nextReviewAt: upcoming[0] ?? null,
				lastActiveAt:
					attempts
						.map((a) => a.createdAt)
						.sort()
						.at(-1) ?? null,
				week: { answers: week.length, correct: week.filter((a) => a.correct).length },
			};
		}),
	);
}
