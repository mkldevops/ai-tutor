import { describe, expect, it } from "vitest";
import { orbiStateForLesson } from "./orbi-state";

const base = { phase: "guided", thinking: false, feedbackCorrect: null, hasHint: false };

describe("orbiStateForLesson", () => {
	it("is ready by default", () => {
		expect(orbiStateForLesson(base)).toBe("ready");
	});

	it("thinks while the tutor replies, whatever the phase", () => {
		expect(orbiStateForLesson({ ...base, phase: "independent", thinking: true })).toBe("thinking");
	});

	it("stays silent in solo phases even after feedback", () => {
		expect(orbiStateForLesson({ ...base, phase: "independent", feedbackCorrect: false })).toBe("solo");
		expect(orbiStateForLesson({ ...base, phase: "review", hasHint: true })).toBe("solo");
	});

	it("reacts to guided feedback", () => {
		expect(orbiStateForLesson({ ...base, feedbackCorrect: true })).toBe("correct");
		expect(orbiStateForLesson({ ...base, feedbackCorrect: false })).toBe("notQuite");
	});

	it("shows feedback over a pending hint", () => {
		expect(orbiStateForLesson({ ...base, feedbackCorrect: false, hasHint: true })).toBe("notQuite");
	});

	it("gives a hint when one is shown", () => {
		expect(orbiStateForLesson({ ...base, hasHint: true })).toBe("hint");
	});

	it("is proud when the lesson is complete", () => {
		expect(orbiStateForLesson({ ...base, phase: "complete", feedbackCorrect: false })).toBe("proud");
	});
});
