import type { AttemptRecord, MasteryEventRecord } from "../store/types";

const DAY = 24 * 60 * 60 * 1000;

export type WeekBucket = { start: string; answers: number; correct: number };
export type StatusChange = Pick<MasteryEventRecord, "fromStatus" | "toStatus" | "actor" | "reason"> & { at: string };
export type ObjectiveHistory = { weeks: WeekBucket[]; changes: StatusChange[] };

export function objectiveHistory(
	attempts: Pick<AttemptRecord, "createdAt" | "correct">[],
	events: Pick<MasteryEventRecord, "createdAt" | "fromStatus" | "toStatus" | "actor" | "reason">[],
	now: Date,
	weekCount = 6,
): ObjectiveHistory {
	const end = now.getTime();
	const first = end - weekCount * 7 * DAY;
	const weeks: WeekBucket[] = Array.from({ length: weekCount }, (_, i) => ({
		start: new Date(first + i * 7 * DAY).toISOString(),
		answers: 0,
		correct: 0,
	}));
	for (const a of attempts) {
		const t = Date.parse(a.createdAt);
		if (t <= first || t > end) continue;
		const bucket = weeks[Math.min(weekCount - 1, Math.floor((t - first) / (7 * DAY)))];
		bucket.answers += 1;
		if (a.correct) bucket.correct += 1;
	}
	const changes = events
		.map((e) => ({ at: e.createdAt, fromStatus: e.fromStatus, toStatus: e.toStatus, actor: e.actor, reason: e.reason }))
		.sort((x, y) => Date.parse(x.at) - Date.parse(y.at));
	return { weeks, changes };
}
