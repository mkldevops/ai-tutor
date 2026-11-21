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
	| { reason: "complete"; nextReviewAt: string | null };

export type OpenSession = { id: string; objectiveCode: string; kind: SessionKind; createdAt: string };
export type PendingReview = { objectiveCode: string; dueAt: string };

export type MissionInput = {
	position: ProgrammePosition;
	openSessions: readonly OpenSession[];
	pendingReviews: readonly PendingReview[];
	now: Date;
};

const byDueThenCode = (a: PendingReview, b: PendingReview) =>
	a.dueAt.localeCompare(b.dueAt) || a.objectiveCode.localeCompare(b.objectiveCode);

export function todaysMission({ position, openSessions, pendingReviews, now }: MissionInput): Mission {
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

	const inProgramme = new Set(position.steps.map((s) => s.objectiveCode));
	const reviews = pendingReviews.filter((r) => inProgramme.has(r.objectiveCode)).sort(byDueThenCode);
	const due = reviews.find((r) => isDue(r.dueAt, now));
	if (due) {
		return {
			reason: "review",
			objectiveCode: due.objectiveCode,
			sessionKind: "review",
			sessionId: null,
			dueAt: due.dueAt,
		};
	}

	const rework = position.steps.find((s) => s.state === "to_rework");
	if (rework) {
		return {
			reason: "rework",
			objectiveCode: rework.objectiveCode,
			sessionKind: "lesson",
			sessionId: null,
			dueAt: null,
		};
	}

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
