import { describe, expect, it, vi } from "vitest";
import { generateCheckedAnswer, UNCHECKED_FALLBACK } from "./checked-answer";

const reply = (text: string) => ({ text, steps: [{ text, toolCalls: [] }] });

describe("generateCheckedAnswer", () => {
	it("returns a correct first draft", async () => {
		const generate = vi.fn().mockResolvedValue(reply("735 − 20 = 715."));
		expect(await generateCheckedAnswer(generate, "explain")).toMatchObject({ text: "735 − 20 = 715.", attempts: 1 });
	});

	it("retries once with the wrong calculations named", async () => {
		const generate = vi
			.fn()
			.mockResolvedValueOnce(reply("735 − 20 = 725."))
			.mockResolvedValueOnce(reply("735 − 20 = 715."));
		const res = await generateCheckedAnswer(generate, "explain");
		expect(res).toMatchObject({ text: "735 − 20 = 715.", attempts: 2 });
		expect(generate.mock.calls[1]?.[0]).toContain('"735 − 20 = 725" (correct: 735 − 20 = 715)');
	});

	it("falls back when the retry is still wrong", async () => {
		const generate = vi.fn().mockResolvedValue(reply("735 − 20 = 725."));
		const res = await generateCheckedAnswer(generate, "explain");
		expect(res.text).toBe(UNCHECKED_FALLBACK);
		expect(res.errors).toHaveLength(1);
		expect(generate).toHaveBeenCalledTimes(2);
	});
});
