export type NovaState =
	| "ready"
	| "wave"
	| "thinking"
	| "hint"
	| "correct"
	| "proud"
	| "notQuite"
	| "solo"
	| "speaking"
	| "listening"
	| "empty"
	| "oops"
	| "avatar";

export const NOVA_IMAGE: Record<NovaState, string> = {
	ready: "/mascot/nova-ready.webp",
	wave: "/mascot/nova-wave.webp",
	thinking: "/mascot/nova-thinking.webp",
	hint: "/mascot/nova-hint.webp",
	correct: "/mascot/nova-correct.webp",
	proud: "/mascot/nova-proud.webp",
	notQuite: "/mascot/nova-not-quite.webp",
	solo: "/mascot/nova-solo.webp",
	speaking: "/mascot/nova-speaking.webp",
	listening: "/mascot/nova-listening.webp",
	empty: "/mascot/nova-empty.webp",
	oops: "/mascot/nova-oops.webp",
	avatar: "/mascot/nova-avatar.webp",
};

export const NOVA_LABEL: Record<NovaState, string> = {
	ready: "Nova is ready",
	wave: "Nova says hello",
	thinking: "Nova is thinking",
	hint: "Nova is giving a hint",
	correct: "Nova is pleased",
	proud: "Nova is proud of you",
	notQuite: "Nova is focused: not quite yet",
	solo: "Nova is quiet: solo check, no help",
	speaking: "Nova is reading aloud",
	listening: "Nova is listening",
	empty: "Nova is waiting for something to show",
	oops: "Nova hit a snag",
	avatar: "Nova",
};

const SOLO_PHASES = new Set(["independent", "review"]);

export function novaStateForLesson(input: {
	phase: string;
	thinking: boolean;
	feedbackCorrect: boolean | null;
	hasHint: boolean;
	listening?: boolean;
	speaking?: boolean;
}): NovaState {
	if (input.thinking) return "thinking";
	if (input.listening) return "listening";
	if (input.phase === "complete") return "proud";
	if (SOLO_PHASES.has(input.phase)) return "solo";
	if (input.feedbackCorrect === true) return "correct";
	if (input.feedbackCorrect === false) return "notQuite";
	if (input.hasHint) return "hint";
	if (input.speaking) return "speaking";
	return "ready";
}
