import type { CompetencyStatus, EvidenceMode, ItemType } from "#/domain/types";

export type EvidenceAttempt = {
	sessionId: string;
	mode: EvidenceMode;
	itemType: ItemType;
	correct: boolean;
	hintsUsed: number;
	createdAt: string;
};

export type MasteryPolicy = {
	independentMinItems: number;
	independentMinAccuracy: number;
	independentMinItemTypes: number;
	guidedDevelopingAccuracy: number;
	reviewMinDelayDays: number;
	reviewMinItems: number;
	reviewMinAccuracy: number;
};

export const DEFAULT_POLICY: MasteryPolicy = {
	independentMinItems: 5,
	independentMinAccuracy: 0.8,
	independentMinItemTypes: 2,
	guidedDevelopingAccuracy: 0.7,
	reviewMinDelayDays: 7,
	reviewMinItems: 4,
	reviewMinAccuracy: 0.8,
};

export type SessionSummary = {
	sessionId: string;
	mode: EvidenceMode;
	items: number;
	correct: number;
	accuracy: number;
	itemTypes: number;
	hintsUsed: number;
	completedAt: string;
};

export type ReviewOutcome = {
	sessionId: string;
	completedAt: string;
	items: number;
	correct: number;
	result: "held" | "slipped" | "too_soon" | "not_secure";
	ordinal: number | null;
	delayDays: number | null;
};

export type MasteryDecision = {
	status: CompetencyStatus;
	reasons: string[];
	securedAt: string | null;
	sessions: SessionSummary[];
	reviews: ReviewOutcome[];
};

const DAY_MS = 86_400_000;

export function summariseSessions(attempts: EvidenceAttempt[]): SessionSummary[] {
	const groups = new Map<string, EvidenceAttempt[]>();
	for (const a of attempts) {
		const key = `${a.sessionId}::${a.mode}`;
		groups.set(key, [...(groups.get(key) ?? []), a]);
	}
	return [...groups.values()]
		.map((group) => {
			const first = group[0] as EvidenceAttempt;
			const correct = group.filter((a) => a.correct).length;
			return {
				sessionId: first.sessionId,
				mode: first.mode,
				items: group.length,
				correct,
				accuracy: correct / group.length,
				itemTypes: new Set(group.map((a) => a.itemType)).size,
				hintsUsed: group.reduce((s, a) => s + a.hintsUsed, 0),
				completedAt: group
					.map((a) => a.createdAt)
					.sort()
					.at(-1) as string,
			};
		})
		.sort((a, b) => a.completedAt.localeCompare(b.completedAt));
}

export function isIndependentPass(s: SessionSummary, p: MasteryPolicy): boolean {
	return (
		s.mode === "independent" &&
		s.items >= p.independentMinItems &&
		s.accuracy >= p.independentMinAccuracy &&
		s.itemTypes >= p.independentMinItemTypes &&
		s.hintsUsed === 0
	);
}

export function evaluateMastery(attempts: EvidenceAttempt[], policy: MasteryPolicy = DEFAULT_POLICY): MasteryDecision {
	const sessions = summariseSessions(attempts);
	if (sessions.length === 0) {
		return { status: "not_started", reasons: ["No evidence yet."], securedAt: null, sessions, reviews: [] };
	}

	let status: CompetencyStatus = "emerging";
	let securedAt: string | null = null;
	const reasons: string[] = [];
	const reviews: ReviewOutcome[] = [];
	let ordinal = 0;
	const review = (s: SessionSummary, result: ReviewOutcome["result"], delayDays: number | null) =>
		reviews.push({
			sessionId: s.sessionId,
			completedAt: s.completedAt,
			items: s.items,
			correct: s.correct,
			result,
			ordinal: result === "held" || result === "slipped" ? ordinal : null,
			delayDays,
		});

	for (const s of sessions) {
		const pct = Math.round(s.accuracy * 100);
		if (s.mode === "diagnostic") continue;
		if (s.mode === "guided") {
			if (status === "emerging" && s.accuracy >= policy.guidedDevelopingAccuracy) {
				status = "developing";
				reasons.push(`Guided practice ${pct}% — developing (guided work alone never confers mastery).`);
			}
			continue;
		}
		if (s.mode === "independent") {
			if (isIndependentPass(s, policy)) {
				if (status !== "mastered") {
					status = "secure";
					if (!securedAt) ordinal = 0;
					securedAt = s.completedAt;
					reasons.push(
						`Independent assessment ${pct}% across ${s.itemTypes} question types — secure, pending delayed review.`,
					);
				}
			} else if (status !== "mastered" && status !== "secure") {
				status = "developing";
				reasons.push(`Independent assessment ${pct}% — below threshold or too narrow; keep practising.`);
			}
			continue;
		}
		if (s.mode === "review") {
			if (!securedAt) {
				review(s, "not_secure", null);
				reasons.push("Review ignored: no prior secure independent assessment.");
				continue;
			}
			const delayDays = (Date.parse(s.completedAt) - Date.parse(securedAt)) / DAY_MS;
			if (delayDays < policy.reviewMinDelayDays) {
				review(s, "too_soon", delayDays);
				reasons.push(`Review after ${delayDays.toFixed(1)} days ignored: too soon to show retention.`);
				continue;
			}
			ordinal += 1;
			if (s.items >= policy.reviewMinItems && s.accuracy >= policy.reviewMinAccuracy && s.hintsUsed === 0) {
				review(s, "held", delayDays);
				status = "mastered";
				reasons.push(`Delayed review ${pct}% after ${Math.floor(delayDays)} days — mastered.`);
			} else {
				review(s, "slipped", delayDays);
				status = "needs_review";
				securedAt = null;
				reasons.push(`Delayed review ${pct}% — not retained; needs re-teaching and reassessment.`);
			}
		}
	}

	if (reasons.length === 0) reasons.push("Only diagnostic evidence so far.");
	return { status, reasons, securedAt, sessions, reviews };
}
