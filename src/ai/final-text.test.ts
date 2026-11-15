import { describe, expect, it } from "vitest";
import { finalAnswerText } from "./final-text";

describe("finalAnswerText", () => {
	it("drops narration emitted alongside tool calls", () => {
		const out = {
			text: "I'll check the objective first.Think of 735 as 7 hundreds.",
			steps: [
				{ text: "I'll check the objective first.", toolCalls: [{}] },
				{ text: "Think of 735 as 7 hundreds.", toolCalls: [] },
			],
		};
		expect(finalAnswerText(out)).toBe("Think of 735 as 7 hundreds.");
	});

	it("falls back to the full text when no step is tool-free", () => {
		expect(finalAnswerText({ text: " Only text ", steps: [{ text: "x", toolCalls: [{}] }] })).toBe("Only text");
	});
});
