import type { CompetencyStatus } from "#/domain/types";

const DAY_MS = 86_400_000;

export const REVIEW_INTERVAL_DAYS: Partial<Record<CompetencyStatus, number>> = {
	secure: 7,
	needs_review: 2,
	developing: 2,
	emerging: 1,
	mastered: 30,
};

export function nextReviewDate(status: CompetencyStatus, from: Date): Date | null {
	const days = REVIEW_INTERVAL_DAYS[status];
	if (days === undefined) return null;
	return new Date(from.getTime() + days * DAY_MS);
}

export function isDue(dueAt: string, now: Date): boolean {
	return Date.parse(dueAt) <= now.getTime();
}
