export type OrbiState = "ready" | "thinking" | "hint" | "correct" | "proud" | "notQuite" | "solo";

export const ORBI_COLOR: Record<OrbiState, string> = {
	ready: "#5EE3D8",
	thinking: "#5EE3D8",
	hint: "#FFB547",
	correct: "#5EE3D8",
	proud: "#5EE3D8",
	notQuite: "#FF7A5C",
	solo: "#EEF0F7",
};

export const ORBI_LABEL: Record<OrbiState, string> = {
	ready: "Orbi is ready",
	thinking: "Orbi is thinking",
	hint: "Orbi is giving a hint",
	correct: "Orbi is pleased",
	proud: "Orbi is proud of you",
	notQuite: "Orbi is focused: not quite yet",
	solo: "Orbi is quiet: solo check, no help",
};

const SOLO_PHASES = new Set(["independent", "review"]);

export function orbiStateForLesson(input: {
	phase: string;
	thinking: boolean;
	feedbackCorrect: boolean | null;
	hasHint: boolean;
}): OrbiState {
	if (input.thinking) return "thinking";
	if (input.phase === "complete") return "proud";
	if (SOLO_PHASES.has(input.phase)) return "solo";
	if (input.feedbackCorrect === true) return "correct";
	if (input.feedbackCorrect === false) return "notQuite";
	if (input.hasHint) return "hint";
	return "ready";
}
