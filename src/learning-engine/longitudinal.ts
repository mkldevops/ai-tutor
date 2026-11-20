import type { CompetencyStatus } from "#/domain/types";
import {
	DEFAULT_POLICY,
	type EvidenceAttempt,
	evaluateMastery,
	type MasteryPolicy,
	type ReviewOutcome,
} from "./mastery";

const DAY_MS = 86_400_000;

export const MIN_RATE_SAMPLE = 5;
export const TRACKED_ORDINALS = 3;
export const OVERDUE_AFTER_DAYS = 1;

export type Rate = { passed: number; total: number; rate: number | null };

export function rate(passed: number, total: number, minSample = MIN_RATE_SAMPLE): Rate {
	return { passed, total, rate: total >= minSample && total > 0 ? passed / total : null };
}

export type ScoredReview = {
	sessionId: string;
	completedAt: string;
	ordinal: number;
	items: number;
	correct: number;
	held: boolean;
	daysAfterSecured: number;
};

export type ObjectiveEvent = {
	createdAt: string;
	fromStatus: CompetencyStatus;
	toStatus: CompetencyStatus;
	actor: "system" | "parent";
};

export type PendingReview = { dueAt: string };

export type ObjectiveLongitudinal = {
	objectiveCode: string;
	status: CompetencyStatus;
	securedAt: string | null;
	masteredAt: string | null;
	daysSinceSecured: number | null;
	reviews: ScoredReview[];
	unscoredReviews: number;
	passRate: Rate;
	retention: Rate[];
	regressions: number;
	lastRegressionAt: string | null;
	nextReview: { dueAt: string; daysOverdue: number; overdue: boolean } | null;
};

export type LearnerLongitudinal = {
	objectives: ObjectiveLongitudinal[];
	passRate: Rate;
	retention: Rate[];
	regressions: number;
	overdueReviews: number;
	unscoredReviews: number;
	securedNow: number;
};

const HELD_UP: CompetencyStatus[] = ["secure", "mastered"];
const SLIPPED_TO: CompetencyStatus[] = ["needs_review", "developing", "emerging"];

export function isRegression(e: ObjectiveEvent): boolean {
	return e.actor === "system" && HELD_UP.includes(e.fromStatus) && SLIPPED_TO.includes(e.toStatus);
}

const days = (from: string, to: number) => Math.floor((to - Date.parse(from)) / DAY_MS);

function scored(r: ReviewOutcome): r is ReviewOutcome & { ordinal: number; delayDays: number } {
	return (r.result === "held" || r.result === "slipped") && r.ordinal !== null && r.delayDays !== null;
}

function retentionByOrdinal(reviews: ScoredReview[], minSample: number): Rate[] {
	return Array.from({ length: TRACKED_ORDINALS }, (_, i) => {
		const at = reviews.filter((r) => r.ordinal === i + 1);
		return rate(at.filter((r) => r.held).length, at.length, minSample);
	});
}

export function objectiveLongitudinal(input: {
	objectiveCode: string;
	attempts: EvidenceAttempt[];
	events: ObjectiveEvent[];
	pending: PendingReview[];
	now: Date;
	policy?: MasteryPolicy;
	minSample?: number;
}): ObjectiveLongitudinal {
	const now = input.now.getTime();
	const minSample = input.minSample ?? MIN_RATE_SAMPLE;
	const decision = evaluateMastery(input.attempts, input.policy ?? DEFAULT_POLICY);
	const reviews: ScoredReview[] = decision.reviews.filter(scored).map((r) => ({
		sessionId: r.sessionId,
		completedAt: r.completedAt,
		ordinal: r.ordinal,
		items: r.items,
		correct: r.correct,
		held: r.result === "held",
		daysAfterSecured: Math.floor(r.delayDays),
	}));
	const securedAt = decision.securedAt;
	const masteredAt = securedAt
		? (reviews.find((r) => r.held && Date.parse(r.completedAt) >= Date.parse(securedAt))?.completedAt ?? null)
		: null;
	const regressions = input.events
		.filter(isRegression)
		.map((e) => e.createdAt)
		.sort();
	const due = input.pending.map((p) => p.dueAt).sort()[0];
	const daysOverdue = due ? Math.max(0, days(due, now)) : 0;
	return {
		objectiveCode: input.objectiveCode,
		status: decision.status,
		securedAt,
		masteredAt,
		daysSinceSecured: securedAt ? Math.max(0, days(securedAt, now)) : null,
		reviews,
		unscoredReviews: decision.reviews.length - reviews.length,
		passRate: rate(reviews.filter((r) => r.held).length, reviews.length, minSample),
		retention: retentionByOrdinal(reviews, minSample),
		regressions: regressions.length,
		lastRegressionAt: regressions.at(-1) ?? null,
		nextReview: due ? { dueAt: due, daysOverdue, overdue: daysOverdue >= OVERDUE_AFTER_DAYS } : null,
	};
}

export function learnerLongitudinal(
	objectives: ObjectiveLongitudinal[],
	minSample = MIN_RATE_SAMPLE,
): LearnerLongitudinal {
	const reviews = objectives.flatMap((o) => o.reviews);
	return {
		objectives,
		passRate: rate(reviews.filter((r) => r.held).length, reviews.length, minSample),
		retention: retentionByOrdinal(reviews, minSample),
		regressions: objectives.reduce((n, o) => n + o.regressions, 0),
		overdueReviews: objectives.filter((o) => o.nextReview?.overdue).length,
		unscoredReviews: objectives.reduce((n, o) => n + o.unscoredReviews, 0),
		securedNow: objectives.filter((o) => o.securedAt !== null).length,
	};
}
