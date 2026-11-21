import type { ProgrammeStep } from "#/curriculum/programme";
import type { CompetencyStatus, Subject } from "#/domain/types";
import { DEFAULT_POLICY, isIndependentPass, type MasteryPolicy, type SessionSummary } from "./mastery";

export const STUCK_AFTER_FAILED_ASSESSMENTS = 2;

const ADVANCING_STATUSES: ReadonlySet<CompetencyStatus> = new Set(["secure", "mastered"]);

export type StepState = "done" | "current" | "locked" | "skipped" | "to_rework";

export type StepCompetency = {
	objectiveCode: string;
	status: CompetencyStatus;
	failedAssessments?: number;
};

export type StepPosition = ProgrammeStep & { state: StepState };

export type ProgrammePosition = {
	steps: StepPosition[];
	current: StepPosition | null;
	currentUnit: { id: string; index: number; subject: Subject } | null;
	stuck: boolean;
	complete: boolean;
	counts: Record<StepState, number> & { total: number };
};

export function countFailedAssessments(sessions: SessionSummary[], policy: MasteryPolicy = DEFAULT_POLICY): number {
	let failed = 0;
	for (const s of sessions) {
		if (s.mode !== "independent") continue;
		failed = isIndependentPass(s, policy) ? 0 : failed + 1;
	}
	return failed;
}

function settledState(status: CompetencyStatus | undefined, skipped: boolean): StepState | null {
	if (status && ADVANCING_STATUSES.has(status)) return "done";
	if (status === "needs_review") return "to_rework";
	if (skipped) return "skipped";
	return null;
}

export function programmePosition(
	sequence: readonly ProgrammeStep[],
	competencies: readonly StepCompetency[],
	skips: Iterable<string> = [],
): ProgrammePosition {
	const byCode = new Map(competencies.map((c) => [c.objectiveCode, c]));
	const skipped = new Set(skips);
	let current: StepPosition | null = null;

	const steps = sequence.map((step): StepPosition => {
		const settled = settledState(byCode.get(step.objectiveCode)?.status, skipped.has(step.objectiveCode));
		if (settled) return { ...step, state: settled };
		if (current) return { ...step, state: "locked" };
		current = { ...step, state: "current" };
		return current;
	});

	const counts = { done: 0, current: 0, locked: 0, skipped: 0, to_rework: 0, total: steps.length };
	for (const s of steps) counts[s.state] += 1;

	const head = current as StepPosition | null;
	const failed = head ? (byCode.get(head.objectiveCode)?.failedAssessments ?? 0) : 0;

	return {
		steps,
		current: head,
		currentUnit: head ? { id: head.unitId, index: head.unitIndex, subject: head.subject } : null,
		stuck: failed >= STUCK_AFTER_FAILED_ASSESSMENTS,
		complete: head === null,
		counts,
	};
}
