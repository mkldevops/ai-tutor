import { getObjective } from "#/curriculum/england-nc";
import {
	type LearnerLongitudinal,
	learnerLongitudinal,
	type ObjectiveLongitudinal,
	objectiveLongitudinal,
} from "#/learning-engine/longitudinal";
import { DEFAULT_POLICY, type MasteryPolicy } from "#/learning-engine/mastery";
import type { DataStore } from "../store/types";
import { type Actor, requireStudent } from "./family";
import { allowedObjectives } from "./learning";

type Deps = { store: DataStore; now?: () => Date; policy?: MasteryPolicy; maxRows?: number };

export const OUTCOMES_MAX_ROWS = 5000;

export type ObjectiveOutcome = ObjectiveLongitudinal & { title: string; subject: string };

export type StudentOutcomes = Omit<LearnerLongitudinal, "objectives"> & {
	student: { id: string; displayName: string; yearGroup: number };
	objectives: ObjectiveOutcome[];
	truncated: boolean;
	policy: { reviewMinAccuracy: number; reviewMinDelayDays: number; reviewMinItems: number };
};

function groupBy<T extends { objectiveCode: string }>(rows: T[]): Map<string, T[]> {
	const out = new Map<string, T[]>();
	for (const r of rows) out.set(r.objectiveCode, [...(out.get(r.objectiveCode) ?? []), r]);
	return out;
}

export async function getStudentOutcomes(deps: Deps, actor: Actor, studentId: string): Promise<StudentOutcomes> {
	const { store } = deps;
	const student = await requireStudent(store, actor, studentId);
	const now = deps.now?.() ?? new Date();
	const policy = deps.policy ?? DEFAULT_POLICY;
	const scope = { studentId: student.id, familyId: actor.familyId };
	const max = deps.maxRows ?? OUTCOMES_MAX_ROWS;
	const reads = await Promise.all([
		store.assessment_attempts.listLatest(scope, max),
		store.mastery_events.listLatest(scope, max),
		store.revision_schedules.listLatest({ ...scope, status: "pending" }, max),
	]);
	const [attempts, events, pending] = [reads[0].rows, reads[1].rows, reads[2].rows];
	const truncated = reads.some((r) => r.truncated);
	const attemptsBy = groupBy(attempts);
	const eventsBy = groupBy(events);
	const pendingBy = groupBy(pending);

	const objectives = allowedObjectives(student.yearGroup)
		.flatMap((code) => {
			const o = getObjective(code);
			return o ? [o] : [];
		})
		.filter((o) => attemptsBy.has(o.code) || eventsBy.has(o.code))
		.map((o) => ({
			title: o.title,
			subject: o.subject,
			...objectiveLongitudinal({
				objectiveCode: o.code,
				attempts: (attemptsBy.get(o.code) ?? []).map((a) => ({
					sessionId: a.sessionId,
					mode: a.mode,
					itemType: a.itemType,
					correct: a.correct,
					hintsUsed: a.hintsUsed,
					createdAt: a.createdAt,
				})),
				events: eventsBy.get(o.code) ?? [],
				pending: pendingBy.get(o.code) ?? [],
				now,
				policy,
			}),
		}));

	const { objectives: _, ...summary } = learnerLongitudinal(objectives);
	return {
		...summary,
		student: { id: student.id, displayName: student.displayName, yearGroup: student.yearGroup },
		objectives,
		truncated,
		policy: {
			reviewMinAccuracy: policy.reviewMinAccuracy,
			reviewMinDelayDays: policy.reviewMinDelayDays,
			reviewMinItems: policy.reviewMinItems,
		},
	};
}
