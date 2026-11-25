import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ConceptMotion } from "./concept-motion";
import { conceptForObjective, motionStep, motionTravel, practiceFeedback, roundingState } from "./concept-motion-data";
import { createCaptionNarrator } from "./concept-motion-narration";

const codes = ["MA-Y5-MD-POWERS10", "MA-Y5-PV-ROUND", "EN-Y5-SP-VERB-PREFIXES", "EN-Y5-SP-VERB-SUFFIXES"];

describe("fixed animated teaching material", () => {
	it("supports each requested concept and safely rejects unknown objective codes", () => {
		for (const code of codes) expect(conceptForObjective(code)?.examples.length).toBeGreaterThanOrEqual(3);
		for (const code of ["unknown", "toString", "__proto__", ""]) expect(conceptForObjective(code)).toBeNull();
	});

	it("moves digits, preserving their identity and correct place values for ×10, ÷100 and ×/÷1000", () => {
		const examples = conceptForObjective(codes[0])!.examples;
		for (const example of examples) {
			if (example.kind !== "digits") throw new Error("Expected place-value example");
			const numericValue = (columns: number[]) =>
				columns.reduce((sum, column, index) => sum + Number(example.digits[index]) * 10 ** (3 - column), 0);
			expect(numericValue(example.start)).toBeCloseTo(example.value, 8);
			expect(numericValue(example.end)).toBeCloseTo(Number(example.result), 8);
			expect(Number(example.result)).toBeCloseTo(
				example.operation === "multiply" ? example.value * 10 ** example.power : example.value / 10 ** example.power,
				8,
			);
			expect(example.end.every((column) => column >= 0 && column <= 6)).toBe(true);
		}
		expect(examples.map((example) => example.kind === "digits" && example.result)).toEqual([
			"47",
			"0.56",
			"720",
			"6000",
			"0.006",
		]);
	});

	it("compares both distances, rounds ties up and keeps the higher places", () => {
		expect(roundingState(2347, 100)).toEqual({
			low: 2300,
			high: 2400,
			distanceLow: 47,
			distanceHigh: 53,
			result: 2300,
			fraction: 0.47,
		});
		expect(roundingState(5862, 100).result).toBe(5900);
		expect(roundingState(1250, 100).result).toBe(1300);
		expect(roundingState(38742, 1000).result).toBe(39000);
		expect(roundingState(2400, 100).result).toBe(2400);
	});

	it("keeps lower-order zeros in every rounded result", () => {
		for (const example of conceptForObjective(codes[1])!.examples) {
			if (example.kind !== "round") throw new Error("Expected rounding example");
			const { result } = roundingState(example.value, example.unit);
			expect(result % example.unit).toBe(0);
			expect(Math.abs(result - example.value)).toBeLessThanOrEqual(example.unit / 2);
		}
	});

	it("uses the Year 5 verb prefixes with correctly spelled words and meanings", () => {
		const checked: Record<string, string> = {
			replay: "play again",
			misread: "read wrongly",
			defrost: "remove the frost or ice",
			disconnect: "break the connection",
			overcook: "cook for too long",
		};
		for (const example of conceptForObjective(codes[2])!.examples) {
			if (example.kind !== "word") throw new Error("Expected word example");
			expect(example.position).toBe("prefix");
			expect(example.stem).toBe(example.base);
			expect(example.affix + example.base).toBe(example.result);
			expect(checked[example.result]).toBe(example.meaning);
		}
	});

	it("uses British verb suffix spellings and explains each dropped letter", () => {
		const checked: Record<string, string> = {
			real: "realise",
			pure: "purify",
			origin: "originate",
			apology: "apologise",
		};
		for (const example of conceptForObjective(codes[3])!.examples) {
			if (example.kind !== "word") throw new Error("Expected word example");
			expect(example.position).toBe("suffix");
			expect(example.stem + example.affix).toBe(checked[example.base]);
			expect(example.result).toBe(checked[example.base]);
			if (example.stem !== example.base)
				expect(example.captions[1]).toContain(`Drop the final ${example.base.slice(-1)}`);
		}
	});

	it("provides specific retry guidance for every distractor, and a separate worked method", () => {
		for (const code of codes) {
			const { practice } = conceptForObjective(code)!;
			expect(practice.choices).toContain(practice.answer);
			expect(practiceFeedback(practice, practice.answer)).toBe(practice.success);
			const wrong = practice.choices.filter((choice) => choice !== practice.answer);
			expect(new Set(wrong.map((choice) => practiceFeedback(practice, choice))).size).toBe(wrong.length);
			for (const choice of wrong) expect(practiceFeedback(practice, choice)).toBe(practice.hints[choice]);
			expect(practice.method.length).toBeGreaterThan(40);
		}
	});
});

describe("motion explanatory states", () => {
	it("has four stable steps, including at both timeline endpoints", () => {
		expect([-1, 0, 0.249, 0.25, 0.5, 0.75, 1, 2].map(motionStep)).toEqual([0, 0, 0, 1, 2, 3, 3, 3]);
	});
	it("gentle motion never uses intermediate travel positions", () => {
		for (let index = 0; index <= 100; index++) expect([0, 1]).toContain(motionTravel(index / 100, true));
		expect(motionTravel(0.49, true)).toBe(0);
		expect(motionTravel(0.5, true)).toBe(1);
	});
	it("regular motion starts and ends in exact place-value columns", () => {
		expect(motionTravel(0, false)).toBe(0);
		expect(motionTravel(1, false)).toBe(1);
		expect(motionTravel(0.45, false)).toBeGreaterThan(0);
		expect(motionTravel(0.45, false)).toBeLessThan(1);
	});
});

describe("ConceptMotion public contract and initial render", () => {
	it("offers explicit caption narration only when a voice callback exists, without speaking on render", () => {
		const onNarrate = vi.fn();
		const onPauseNarration = vi.fn();
		const html = renderToStaticMarkup(
			createElement(ConceptMotion, { objectiveCode: codes[0], onNarrate, onPauseNarration }),
		);
		expect(html).toContain('data-testid="motion-narrate"');
		expect(html).toContain("Hear this step");
		expect(html).toContain('data-testid="motion-stop-narration"');
		expect(html).toContain("Listening pauses the animation");
		expect(onNarrate).not.toHaveBeenCalled();
		expect(onPauseNarration).not.toHaveBeenCalled();
		expect(renderToStaticMarkup(createElement(ConceptMotion, { objectiveCode: codes[0] }))).not.toContain(
			'data-testid="motion-narrate"',
		);
	});
	it("renders nothing for unsupported objectives", () => {
		expect(renderToStaticMarkup(createElement(ConceptMotion, { objectiveCode: "other" }))).toBe("");
	});
	it("starts compact support closed without rendering controls or a diagram", () => {
		const html = renderToStaticMarkup(createElement(ConceptMotion, { objectiveCode: codes[0], compact: true }));
		expect(html).toContain('data-testid="concept-motion"');
		expect(html).toContain('aria-expanded="false"');
		expect(html).toContain("See an animated example");
		expect(html).not.toContain("<svg");
		expect(html).not.toContain('data-testid="motion-play"');
	});
	it("starts open and paused, with labelled native controls and stable narration", () => {
		for (const objectiveCode of codes) {
			const html = renderToStaticMarkup(createElement(ConceptMotion, { objectiveCode }));
			expect(html).toContain('aria-expanded="true"');
			expect(html).toContain('data-testid="motion-play"');
			expect(html).toContain(">Play</button>");
			expect(html).toContain('data-testid="motion-timeline"');
			expect(html).toContain('aria-valuetext="Step 1 of 4:');
			expect(html).toContain("<output");
			expect(html).toContain('data-testid="motion-practice"');
			expect(html).toContain("no score");
		}
	});
});

describe("caption narration controls", () => {
	it("stops the previous utterance before speaking exactly the chosen caption", () => {
		const events: string[] = [];
		const narrator = createCaptionNarrator(() => ({
			onNarrate: (caption) => events.push(caption),
			onPauseNarration: () => events.push("stop"),
		}));
		expect(events).toEqual([]);
		const caption = conceptForObjective(codes[0])!.examples[0].captions[2];
		narrator.hear(caption);
		expect(events).toEqual(["stop", caption]);
		narrator.stop();
		expect(events).toEqual(["stop", caption, "stop"]);
	});
	it("reads the latest callbacks without restarting or speaking when callbacks change", () => {
		const oldSpeak = vi.fn();
		const oldStop = vi.fn();
		const newSpeak = vi.fn();
		const newStop = vi.fn();
		let current = { onNarrate: oldSpeak, onPauseNarration: oldStop };
		const narrator = createCaptionNarrator(() => current);
		narrator.hear("First caption");
		current = { onNarrate: newSpeak, onPauseNarration: newStop };
		expect(newSpeak).not.toHaveBeenCalled();
		expect(newStop).not.toHaveBeenCalled();
		narrator.hear("Selected step caption");
		narrator.stop();
		expect(oldSpeak).toHaveBeenCalledExactlyOnceWith("First caption");
		expect(oldStop).toHaveBeenCalledTimes(1);
		expect(newSpeak).toHaveBeenCalledExactlyOnceWith("Selected step caption");
		expect(newStop).toHaveBeenCalledTimes(2);
	});
	it("works without a voice provider or optional callbacks", () => {
		const narrator = createCaptionNarrator(() => ({}));
		expect(() => {
			narrator.hear("Caption");
			narrator.stop();
		}).not.toThrow();
	});
});
