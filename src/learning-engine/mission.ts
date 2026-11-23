import type { SessionKind } from "#/domain/types";
import type { ProgrammePosition } from "./programme";
import { isDue } from "./scheduling";

export type MissionReason = "continue" | "review" | "rework" | "current";

export type Mission =
	| {
			reason: MissionReason;
			objectiveCode: string;
			sessionKind: SessionKind;
			sessionId: string | null;
			dueAt: string | null;
	  }
	| { reason: "complete"; nextReviewAt: string | null }
	| { reason: "paused" }
	| { reason: "done_for_today" };

export type ActiveMission = Extract<Mission, { reason: MissionReason }>;

export const isActiveMission = (mission: Mission): mission is ActiveMission =>
	mission.reason !== "complete" && mission.reason !== "paused" && mission.reason !== "done_for_today";

export type OpenSession = { id: string; objectiveCode: string; kind: SessionKind; createdAt: string };
export type PendingReview = { objectiveCode: string; dueAt: string };
export type CompletedMission = { kind: SessionKind; completedAt: string };

export const MAX_REVIEWS_BEFORE_LESSON = 2;
export const MISSION_HISTORY_WINDOW = 20;

export type MissionInput = {
	position: ProgrammePosition;
	openSessions: readonly OpenSession[];
	pendingReviews: readonly PendingReview[];
	recentMissions?: readonly CompletedMission[];
	paused?: boolean;
	dailyNewStepCap?: boolean;
	lastSecuredAt?: string | null;
	now: Date;
};

type CourseKind = "lesson" | "review";

const byDueThenCode = (a: PendingReview, b: PendingReview) =>
	a.dueAt.localeCompare(b.dueAt) || a.objectiveCode.localeCompare(b.objectiveCode);

function programmeReviews(position: ProgrammePosition, pendingReviews: readonly PendingReview[]) {
	const inProgramme = new Set(position.steps.map((s) => s.objectiveCode));
	return pendingReviews.filter((r) => inProgramme.has(r.objectiveCode)).sort(byDueThenCode);
}

export function dueReviews(position: ProgrammePosition, pendingReviews: readonly PendingReview[], now: Date) {
	return programmeReviews(position, pendingReviews).filter((r) => isDue(r.dueAt, now));
}

function courseKinds(missions: readonly CompletedMission[]): CourseKind[] {
	return missions
		.filter((m): m is CompletedMission & { kind: CourseKind } => m.kind === "lesson" || m.kind === "review")
		.sort((a, b) => b.completedAt.localeCompare(a.completedAt))
		.map((m) => m.kind);
}

export function reviewSlots(recentMissions: readonly CompletedMission[]): number {
	const [last, before, earlier] = courseKinds(recentMissions);
	if (last !== "review") return before === "review" ? 1 : MAX_REVIEWS_BEFORE_LESSON;
	if (before === "review") return 0;
	return before === undefined || earlier !== "review" ? MAX_REVIEWS_BEFORE_LESSON - 1 : 0;
}

const lessonAvailable = (position: ProgrammePosition) =>
	position.current !== null || position.steps.some((s) => s.state === "to_rework");

const utcDay = (at: Date) => at.toISOString().slice(0, 10);

export function securedToday(lastSecuredAt: string | null | undefined, now: Date): boolean {
	if (!lastSecuredAt) return false;
	const at = new Date(lastSecuredAt);
	return !Number.isNaN(at.getTime()) && at.getTime() <= now.getTime() && utcDay(at) === utcDay(now);
}

export function deferredReviews({
	position,
	pendingReviews,
	recentMissions = [],
	now,
}: Omit<MissionInput, "openSessions">) {
	const due = dueReviews(position, pendingReviews, now).length;
	if (!lessonAvailable(position)) return 0;
	return Math.max(0, due - reviewSlots(recentMissions));
}

export function todaysMission({
	position,
	openSessions,
	pendingReviews,
	recentMissions = [],
	paused = false,
	dailyNewStepCap = false,
	lastSecuredAt = null,
	now,
}: MissionInput): Mission {
	if (paused) return { reason: "paused" };
	const open = [...openSessions].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))[0];
	if (open) {
		return {
			reason: "continue",
			objectiveCode: open.objectiveCode,
			sessionKind: open.kind,
			sessionId: open.id,
			dueAt: null,
		};
	}

	const capped = dailyNewStepCap && securedToday(lastSecuredAt, now);
	const rework = position.steps.find((s) => s.state === "to_rework");
	const lessonOpen = rework !== undefined || (position.current !== null && !capped);
	const reviews = programmeReviews(position, pendingReviews);
	const due = reviews.find((r) => isDue(r.dueAt, now));
	if (due && (!lessonOpen || reviewSlots(recentMissions) > 0)) {
		return {
			reason: "review",
			objectiveCode: due.objectiveCode,
			sessionKind: "review",
			sessionId: null,
			dueAt: due.dueAt,
		};
	}

	if (rework) {
		return {
			reason: "rework",
			objectiveCode: rework.objectiveCode,
			sessionKind: "lesson",
			sessionId: null,
			dueAt: null,
		};
	}

	if (position.current && capped) return { reason: "done_for_today" };

	if (position.current) {
		return {
			reason: "current",
			objectiveCode: position.current.objectiveCode,
			sessionKind: "lesson",
			sessionId: null,
			dueAt: null,
		};
	}

	return { reason: "complete", nextReviewAt: reviews[0]?.dueAt ?? null };
}
