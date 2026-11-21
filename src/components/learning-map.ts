import type { LessonPhase } from "#/domain/types";

export const FLIGHT_STEPS = ["Recall", "Explain", "Practise", "Solo flight"] as const;

const STEP_INDEX: Partial<Record<LessonPhase, number>> = {
	diagnostic: 0,
	instruction: 1,
	guided: 2,
	independent: 3,
	complete: FLIGHT_STEPS.length,
};

export function flightStep(phase: LessonPhase): number | null {
	return STEP_INDEX[phase] ?? null;
}

export type PlanetKind = "lasting" | "secure" | "active" | "review" | "unreached";
