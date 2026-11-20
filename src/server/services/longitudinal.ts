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

type Deps = { store: DataStore; now?: () => Date; policy?: MasteryPolicy };

export type ObjectiveOutcome = ObjectiveLongitudinal & { title: string; subject: string };

export type StudentOutcomes = Omit<LearnerLongitudinal, "objectives"> & {
	student: { id: string; displayName: string; yearGroup: number };
	objectives: ObjectiveOutcome[];
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
	const [attempts, events, pending] = await Promise.all([
		store.assessment_attempts.listAll(scope),
		store.mastery_events.listAll(scope),
		store.revision_schedules.listAll({ ...scope, status: "pending" }),
	]);
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
		policy: {
			reviewMinAccuracy: policy.reviewMinAccuracy,
			reviewMinDelayDays: policy.reviewMinDelayDays,
			reviewMinItems: policy.reviewMinItems,
		},
	};
}
