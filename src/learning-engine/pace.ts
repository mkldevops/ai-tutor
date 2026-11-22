import type { SessionKind } from "#/domain/types";

const DAY_MS = 86_400_000;
export const PACE_WINDOW_DAYS = 7;
export const DEFAULT_MISSIONS_PER_STEP = 2;

export type PaceStatus = "on_track" | "behind" | "paused" | "complete";
export type PaceBasis = "observed" | "target";

export type PaceSession = { kind: SessionKind; completedAt: string | null };

export type PaceInput = {
	target: number;
	paused: boolean;
	sessions: readonly PaceSession[];
	stepsRemaining: number;
	stepsDone: number;
	startedAt: string;
	now: Date;
};

export type Pace = {
	status: PaceStatus;
	target: number;
	missionsThisWeek: number;
	expectedSoFar: number;
	missionsPerStep: number;
	projectedEndAt: string | null;
	basis: PaceBasis | null;
};

const isCourse = (s: PaceSession): s is PaceSession & { completedAt: string } =>
	s.completedAt !== null && s.kind !== "extra";

export function countMissions(sessions: readonly PaceSession[], now: Date, days = PACE_WINDOW_DAYS): number {
	const end = now.getTime();
	const since = end - days * DAY_MS;
	return sessions.filter((s) => {
		if (!isCourse(s)) return false;
		const at = Date.parse(s.completedAt);
		return at > since && at <= end;
	}).length;
}

export function missionsPerStep(sessions: readonly PaceSession[], stepsDone: number): number {
	const done = sessions.filter(isCourse).length;
	if (stepsDone <= 0 || done === 0) return DEFAULT_MISSIONS_PER_STEP;
	return Math.max(1, done / stepsDone);
}

export function expectedMissions(target: number, startedAt: string, now: Date): number {
	const elapsedDays = Math.max(0, (now.getTime() - Date.parse(startedAt)) / DAY_MS);
	return Math.floor((target * Math.min(PACE_WINDOW_DAYS, elapsedDays)) / PACE_WINDOW_DAYS);
}

export function projectEnd(stepsRemaining: number, perStep: number, perWeek: number, now: Date): string | null {
	if (stepsRemaining <= 0 || perWeek <= 0) return null;
	const days = Math.ceil(((stepsRemaining * perStep) / perWeek) * PACE_WINDOW_DAYS);
	const end = new Date(now.getTime() + days * DAY_MS);
	end.setUTCHours(0, 0, 0, 0);
	return end.toISOString();
}

export function projectPace(input: PaceInput): Pace {
	const { target, paused, sessions, stepsRemaining, stepsDone, startedAt, now } = input;
	const missionsThisWeek = countMissions(sessions, now);
	const expectedSoFar = expectedMissions(target, startedAt, now);
	const perStep = missionsPerStep(sessions, stepsDone);
	const base = { target, missionsThisWeek, expectedSoFar, missionsPerStep: perStep };

	if (stepsRemaining <= 0) return { ...base, status: "complete", projectedEndAt: null, basis: null };
	if (paused) return { ...base, status: "paused", projectedEndAt: null, basis: null };

	const basis: PaceBasis = missionsThisWeek > 0 ? "observed" : "target";
	const perWeek = basis === "observed" ? missionsThisWeek : target;
	return {
		...base,
		status: missionsThisWeek >= expectedSoFar ? "on_track" : "behind",
		projectedEndAt: projectEnd(stepsRemaining, perStep, perWeek, now),
		basis,
	};
}
