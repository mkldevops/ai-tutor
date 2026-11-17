import type { CompetencyStatus } from "#/domain/types";

const DAY_MS = 86_400_000;

export const REVIEW_INTERVAL_DAYS: Partial<Record<CompetencyStatus, readonly number[]>> = {
	secure: [7, 14, 30, 60],
	mastered: [30, 60, 120],
	needs_review: [2],
	developing: [2],
	emerging: [1],
};

export function reviewIntervalDays(status: CompetencyStatus, successfulReviews = 0): number | null {
	const steps = REVIEW_INTERVAL_DAYS[status];
	if (!steps) return null;
	return steps[Math.min(Math.max(0, successfulReviews), steps.length - 1)];
}

export function nextReviewDate(status: CompetencyStatus, from: Date, successfulReviews = 0): Date | null {
	const days = reviewIntervalDays(status, successfulReviews);
	if (days === null) return null;
	return new Date(from.getTime() + days * DAY_MS);
}

export function isDue(dueAt: string, now: Date): boolean {
	return Date.parse(dueAt) <= now.getTime();
}
