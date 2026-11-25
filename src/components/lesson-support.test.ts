import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AnswerFeedback, AnswerSaved } from "./answer-feedback";
import { ExplanationStepper } from "./explanation-stepper";
import { answerFormat, completionMessage, LessonSummary } from "./lesson-support";
import { RateConfidence } from "./mission-complete";

describe("child lesson support", () => {
	it("describes the required answer without giving a method or calculation", () => {
		expect(answerFormat({ type: "multiple_choice", choices: ["2", "3"] })).toBe("Choose one answer.");
		expect(answerFormat({ type: "written" })).toBe("Write the whole answer, then press Check.");
		expect(answerFormat({ type: "missing_number" })).toContain("just the missing number");
		expect(answerFormat({ type: "word_problem" })).toContain("number answer");
	});

	it("offers neutral recovery, worked steps and an alternative without crossing out the answer", () => {
		const html = renderToStaticMarkup(
			createElement(AnswerFeedback, {
				feedback: {
					correct: false,
					message: "Let's check the ones.",
					yourAnswer: "31",
					correctAnswer: "32",
					workedSolution: "Add the ones first.",
					alternativeExplanation: "Use a number line.",
				},
				onNext: () => {},
			}),
		);
		expect(html).toContain("Continue");
		expect(html).toContain("Add the ones first.");
		expect(html).toContain("Use a number line.");
		expect(html).not.toMatch(/line-through|I understand/);
	});

	it("makes correct feedback child-controlled and assessment acknowledgement neutral", () => {
		const correct = renderToStaticMarkup(
			createElement(AnswerFeedback, {
				feedback: { correct: true, message: "You checked the answer." },
				onNext: () => {},
			}),
		);
		expect(correct).toContain('data-testid="feedback-continue"');
		expect(correct).not.toContain("celebrate-track");
		const saved = renderToStaticMarkup(createElement(AnswerSaved, { onNext: () => {} }));
		expect(saved).toContain("Answer saved");
		expect(saved).not.toMatch(/Bravo|correct-answer|data-correct/);
	});

	it("allows practice from the first explanation step", () => {
		const html = renderToStaticMarkup(
			createElement(ExplanationStepper, {
				steps: [
					{ text: "First example.", reminder: false },
					{ text: "Another example.", reminder: false },
				],
				onStep: () => {},
				onReady: () => {},
				readyPending: false,
				extras: null,
			}),
		);
		expect(html).toContain("Step 1 of 2");
		expect(html).toContain("First example.");
		expect(html).toContain("ready to practise");
	});

	it("describes the course status without claiming today's session passed", () => {
		expect(completionMessage("secure")).toContain("later review");
		expect(completionMessage("secure")).toContain("currently marked Secure");
		expect(completionMessage("mastered")).toContain("currently marked Mastered");
		expect(completionMessage("developing")).toContain("more to practise");
		const html = renderToStaticMarkup(createElement(LessonSummary, { title: "Adding tens", status: "secure" }));
		expect(html).toContain("Adding tens");
	});

	it("records confidence without treating a higher rating as proof of learning", () => {
		const html = renderToStaticMarkup(createElement(RateConfidence, { before: 2, after: 5, onRate: () => {} }));
		expect(html).toContain("Before: 2 of 5");
		expect(html).toContain("This records how you feel");
		expect(html).not.toMatch(/Practice paid off|plan your next mission/);
	});
});
