import { getObjective } from "#/curriculum/england-nc";
import { createRng, generateItem, hashSeed, supportedTypes } from "#/curriculum/generators";
import type { EvidenceMode, Item, ItemType, LessonPhase, PublicItem, SessionKind } from "#/domain/types";
import { toPublicItem } from "#/domain/types";
import { gradeResponse } from "./grading";

export const LESSON_SIZES = {
	diagnosticPrereq: 2,
	diagnosticTarget: 2,
	guided: 5,
	independent: 6,
	review: 4,
} as const;

export type LessonLogEntry = {
	itemId: string;
	objectiveCode: string;
	mode: EvidenceMode;
	itemType: ItemType;
	correct: boolean;
	hintsUsed: number;
};

export type LessonState = {
	kind: SessionKind;
	objectiveCode: string;
	prerequisiteCodes: string[];
	seed: string;
	phase: LessonPhase;
	items: Item[];
	index: number;
	difficulty: 1 | 2 | 3;
	counter: number;
	consecutiveWrong: number;
	hintsShown: number;
	weakPrerequisites: string[];
	log: LessonLogEntry[];
};

export type Feedback = {
	correct: boolean;
	message: string;
	workedSolution?: string;
	alternativeExplanation?: string;
	question?: string;
	yourAnswer?: string;
	correctAnswer?: string;
	hint?: string;
};

export type LessonView = {
	kind: SessionKind;
	objectiveCode: string;
	phase: LessonPhase;
	item: PublicItem | null;
	position: number;
	total: number;
	canHint: boolean;
	explanation: string[] | null;
	explanationSteps: ExplanationStep[] | null;
};

export type ExplanationStep = { reminder: boolean; text: string };

const modeForPhase = (phase: LessonPhase): EvidenceMode => {
	switch (phase) {
		case "diagnostic":
			return "diagnostic";
		case "guided":
			return "guided";
		case "independent":
			return "independent";
		case "review":
			return "review";
		default:
			throw new Error(`Phase ${phase} has no items`);
	}
};

function nextItem(state: LessonState, objectiveCode: string, difficulty: 1 | 2 | 3, type?: ItemType): Item {
	const rng = createRng(hashSeed(`${state.seed}:${state.counter}`));
	state.counter += 1;
	return generateItem(objectiveCode, {
		rng,
		difficulty,
		...(type ? { type } : {}),
		id: `${state.phase}-${state.counter}`,
	});
}

function mixedSet(state: LessonState, count: number, difficulty: 1 | 2 | 3): Item[] {
	const types = supportedTypes(state.objectiveCode);
	return Array.from({ length: count }, (_, i) =>
		nextItem(state, state.objectiveCode, difficulty, types[i % types.length]),
	);
}

export function startLesson(args: {
	kind: SessionKind;
	objectiveCode: string;
	prerequisiteCodes: string[];
	seed: string;
}): LessonState {
	const state: LessonState = {
		...args,
		phase: args.kind === "review" ? "review" : "diagnostic",
		items: [],
		index: 0,
		difficulty: 2,
		counter: 0,
		consecutiveWrong: 0,
		hintsShown: 0,
		weakPrerequisites: [],
		log: [],
	};
	if (args.kind === "review") {
		state.items = mixedSet(state, LESSON_SIZES.review, 2);
		return state;
	}
	const items: Item[] = [];
	for (const code of args.prerequisiteCodes) {
		for (let i = 0; i < LESSON_SIZES.diagnosticPrereq; i++) items.push(nextItem(state, code, 2));
	}
	for (let i = 0; i < LESSON_SIZES.diagnosticTarget; i++) {
		items.push(nextItem(state, args.objectiveCode, 1));
	}
	state.items = items;
	return state;
}

export function currentItem(state: LessonState): Item | null {
	return state.items[state.index] ?? null;
}

function totalFor(state: LessonState): number {
	if (state.phase === "guided") return LESSON_SIZES.guided;
	return state.items.length;
}

export function viewLesson(state: LessonState): LessonView {
	const item = currentItem(state);
	return {
		kind: state.kind,
		objectiveCode: state.objectiveCode,
		phase: state.phase,
		item: item && state.phase !== "instruction" && state.phase !== "complete" ? toPublicItem(item) : null,
		position: state.index + 1,
		total: totalFor(state),
		canHint: state.phase === "guided",
		explanation: state.phase === "instruction" ? buildExplanation(state) : null,
		explanationSteps: state.phase === "instruction" ? buildExplanationSteps(state) : null,
	};
}

export function buildExplanation(state: LessonState): string[] {
	const lines: string[] = [];
	for (const code of state.weakPrerequisites) {
		const prereq = getObjective(code);
		if (prereq) lines.push("First, a quick reminder:", ...prereq.explanation);
	}
	const target = getObjective(state.objectiveCode);
	if (target) lines.push(...target.explanation);
	return lines;
}

export function buildExplanationSteps(state: LessonState): ExplanationStep[] {
	const steps: ExplanationStep[] = [];
	for (const code of state.weakPrerequisites) {
		for (const text of getObjective(code)?.explanation ?? []) steps.push({ reminder: true, text });
	}
	for (const text of getObjective(state.objectiveCode)?.explanation ?? []) steps.push({ reminder: false, text });
	return steps;
}

export function requestHint(state: LessonState): { state: LessonState; hint: string } {
	if (state.phase !== "guided") throw new LessonError("Hints are only available during guided practice.");
	const item = currentItem(state);
	if (!item) throw new LessonError("No current question.");
	return { state: { ...state, hintsShown: state.hintsShown + 1 }, hint: item.hint };
}

export function continueToPractice(state: LessonState): LessonState {
	if (state.phase !== "instruction") throw new LessonError("Not in instruction phase.");
	const next: LessonState = { ...state, phase: "guided", index: 0, items: [], hintsShown: 0 };
	next.items = [nextItem(next, next.objectiveCode, next.difficulty)];
	return next;
}

export class LessonError extends Error {}

export function submitAnswer(
	prev: LessonState,
	response: string,
): { state: LessonState; entry: LessonLogEntry; feedback: Feedback | null } {
	const item = currentItem(prev);
	if (!item || prev.phase === "instruction" || prev.phase === "complete") {
		throw new LessonError("No question is waiting for an answer.");
	}
	const state: LessonState = structuredClone(prev);
	const mode = modeForPhase(state.phase);
	const { correct } = gradeResponse(item, response);
	const entry: LessonLogEntry = {
		itemId: item.id,
		objectiveCode: item.objectiveCode,
		mode,
		itemType: item.type,
		correct,
		hintsUsed: mode === "guided" ? state.hintsShown : 0,
	};
	state.log.push(entry);
	state.hintsShown = 0;

	if (state.phase === "diagnostic") {
		state.index += 1;
		if (state.index >= state.items.length) {
			const diag = state.log.filter((l) => l.mode === "diagnostic");
			state.weakPrerequisites = state.prerequisiteCodes.filter((code) =>
				diag.some((l) => l.objectiveCode === code && !l.correct),
			);
			const targetAllCorrect = diag.filter((l) => l.objectiveCode === state.objectiveCode).every((l) => l.correct);
			state.difficulty = targetAllCorrect && state.weakPrerequisites.length === 0 ? 2 : 1;
			state.phase = "instruction";
			state.items = [];
			state.index = 0;
		}
		return { state, entry, feedback: null };
	}

	if (state.phase === "guided") {
		let feedback: Feedback;
		if (correct) {
			state.consecutiveWrong = 0;
			state.difficulty = Math.min(3, state.difficulty + 1) as 1 | 2 | 3;
			feedback = {
				correct: true,
				message:
					entry.hintsUsed > 0 ? "Well done, the hint helped you get there." : "Well done! Next one is a bit harder.",
			};
		} else {
			state.consecutiveWrong += 1;
			state.difficulty = Math.max(1, state.difficulty - 1) as 1 | 2 | 3;
			const target = getObjective(item.objectiveCode);
			feedback = {
				correct: false,
				message: "Not quite. Let's look at it together.",
				question: item.prompt,
				yourAnswer: response.trim(),
				correctAnswer: item.answer,
				hint: item.hint,
				workedSolution: item.workedSolution,
				...(target?.explanation[1] ? { alternativeExplanation: target.explanation[1] } : {}),
			};
		}
		state.index += 1;
		if (state.index >= LESSON_SIZES.guided) {
			state.phase = "independent";
			state.index = 0;
			state.items = mixedSet(state, LESSON_SIZES.independent, 2);
		} else {
			const prereq = state.prerequisiteCodes[0];
			const usePrereq = state.consecutiveWrong >= 2 && prereq !== undefined;
			const isLast = state.index === LESSON_SIZES.guided - 1;
			state.items.push(
				usePrereq
					? nextItem(state, prereq, 1)
					: nextItem(state, state.objectiveCode, state.difficulty, isLast && correct ? "word_problem" : undefined),
			);
			if (usePrereq) state.consecutiveWrong = 0;
		}
		return { state, entry, feedback };
	}

	state.index += 1;
	if (state.index >= state.items.length) state.phase = "complete";
	return { state, entry, feedback: null };
}
