import { DEFAULT_POLICY } from "#/learning-engine/mastery";
import type { AttemptRecord, LearningSessionRecord } from "../store/types";

export type Calibration = "matches" | "over" | "under";

export type ConfidenceCheck = {
	sessionId: string;
	objectiveCode: string;
	completedAt: string;
	confidence: number;
	accuracy: number;
	calibration: Calibration;
};

export type LearningOutcomes = {
	reviews: { completed: number; held: number; accuracy: number | null };
	confidence: { checks: ConfidenceCheck[]; matches: number; over: number; under: number };
};

const SCORED_MODES = new Set(["independent", "review"]);
const CALIBRATION_MARGIN = 0.2;

type SessionInput = Pick<LearningSessionRecord, "id" | "objectiveCode" | "kind" | "completedAt" | "confidence">;
type AttemptInput = Pick<AttemptRecord, "sessionId" | "mode" | "correct">;

function score(attempts: AttemptInput[]) {
	return { items: attempts.length, correct: attempts.filter((a) => a.correct).length };
}

export function learningOutcomes(
	sessions: SessionInput[],
	attempts: AttemptInput[],
	reviewMinAccuracy = DEFAULT_POLICY.reviewMinAccuracy,
): LearningOutcomes {
	const bySession = new Map<string, AttemptInput[]>();
	for (const a of attempts) bySession.set(a.sessionId, [...(bySession.get(a.sessionId) ?? []), a]);
	const completed = sessions.filter((s): s is SessionInput & { completedAt: string } => s.completedAt !== null);

	const reviewScores = completed
		.filter((s) => s.kind === "review")
		.map((s) => score((bySession.get(s.id) ?? []).filter((a) => a.mode === "review")))
		.filter((r) => r.items > 0);
	const reviewItems = reviewScores.reduce((n, r) => n + r.items, 0);
	const reviewCorrect = reviewScores.reduce((n, r) => n + r.correct, 0);

	const checks: ConfidenceCheck[] = completed.flatMap((s) => {
		const confidence = s.confidence?.after ?? s.confidence?.before;
		if (confidence === undefined) return [];
		const r = score((bySession.get(s.id) ?? []).filter((a) => SCORED_MODES.has(a.mode)));
		if (r.items === 0) return [];
		const accuracy = r.correct / r.items;
		const gap = confidence / 5 - accuracy;
		const calibration: Calibration =
			gap > CALIBRATION_MARGIN ? "over" : gap < -CALIBRATION_MARGIN ? "under" : "matches";
		return [
			{
				sessionId: s.id,
				objectiveCode: s.objectiveCode,
				completedAt: s.completedAt,
				confidence,
				accuracy,
				calibration,
			},
		];
	});
	checks.sort((x, y) => Date.parse(y.completedAt) - Date.parse(x.completedAt));
	const count = (c: Calibration) => checks.filter((x) => x.calibration === c).length;

	return {
		reviews: {
			completed: reviewScores.length,
			held: reviewScores.filter((r) => r.correct / r.items >= reviewMinAccuracy).length,
			accuracy: reviewItems > 0 ? reviewCorrect / reviewItems : null,
		},
		confidence: { checks: checks.slice(0, 10), matches: count("matches"), over: count("over"), under: count("under") },
	};
}
