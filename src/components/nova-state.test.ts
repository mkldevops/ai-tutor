import { describe, expect, it } from "vitest";
import { novaStateForLesson } from "./nova-state";

const base = { phase: "guided", thinking: false, feedbackCorrect: null, hasHint: false };

describe("novaStateForLesson", () => {
	it("is ready by default", () => {
		expect(novaStateForLesson(base)).toBe("ready");
	});

	it("thinks while the tutor replies, whatever the phase", () => {
		expect(novaStateForLesson({ ...base, phase: "independent", thinking: true })).toBe("thinking");
	});

	it("stays silent in solo phases even after feedback", () => {
		expect(novaStateForLesson({ ...base, phase: "independent", feedbackCorrect: false })).toBe("solo");
		expect(novaStateForLesson({ ...base, phase: "review", hasHint: true })).toBe("solo");
	});

	it("reacts to guided feedback", () => {
		expect(novaStateForLesson({ ...base, feedbackCorrect: true })).toBe("correct");
		expect(novaStateForLesson({ ...base, feedbackCorrect: false })).toBe("notQuite");
	});

	it("shows feedback over a pending hint", () => {
		expect(novaStateForLesson({ ...base, feedbackCorrect: false, hasHint: true })).toBe("notQuite");
	});

	it("gives a hint when one is shown", () => {
		expect(novaStateForLesson({ ...base, hasHint: true })).toBe("hint");
	});

	it("is proud when the lesson is complete", () => {
		expect(novaStateForLesson({ ...base, phase: "complete", feedbackCorrect: false })).toBe("proud");
	});
});

describe("novaStateForLesson voice", () => {
	const base = { phase: "guided", thinking: false, feedbackCorrect: null, hasHint: false };

	it("listens while the learner speaks, even in solo phases", () => {
		expect(novaStateForLesson({ ...base, phase: "independent", listening: true })).toBe("listening");
	});

	it("speaks only when nothing more informative is shown", () => {
		expect(novaStateForLesson({ ...base, speaking: true })).toBe("speaking");
		expect(novaStateForLesson({ ...base, speaking: true, feedbackCorrect: true })).toBe("correct");
		expect(novaStateForLesson({ ...base, phase: "review", speaking: true })).toBe("solo");
	});
});
