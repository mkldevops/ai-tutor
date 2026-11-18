import { describe, expect, it } from "vitest";
import { type GuardEvent, guardReply, leaksAnswer, STOP_NOTICES } from "./reply-guard";

async function* chunks(parts: string[]) {
	for (const p of parts) yield p;
}

async function collect(parts: string[], forbiddenAnswers: string[] = [], maxChars = 500) {
	const events: GuardEvent[] = [];
	for await (const e of guardReply(chunks(parts), { forbiddenAnswers, maxChars })) events.push(e);
	return events;
}

const text = (events: GuardEvent[]) => events.map((e) => e.text).join("");

describe("leaksAnswer", () => {
	it("matches numeric answers with or without thousands separators", () => {
		expect(leaksAnswer("So the answer is 4,500.", ["4500"])).toBe(true);
		expect(leaksAnswer("Try 450 first.", ["4500"])).toBe(false);
	});

	it("matches word answers as whole phrases only", () => {
		expect(leaksAnswer("It is a Triangle!", ["triangle"])).toBe(true);
		expect(leaksAnswer("Think about triangles.", ["triangle"])).toBe(false);
	});

	it("treats curly and straight quotes alike", () => {
		expect(leaksAnswer("Write “Can we go now?” asked Ella.", ['"Can we go now?" asked Ella.'])).toBe(true);
		expect(leaksAnswer("It’s ‘who’.", ["'who'"])).toBe(true);
	});
});

describe("guardReply", () => {
	it("releases a clean reply sentence by sentence", async () => {
		const events = await collect(["Good thinking! Let's", " look at tens. What", " do you notice?"]);
		expect(events.every((e) => e.type === "text")).toBe(true);
		expect(events[0]?.text).toBe("Good thinking!");
		expect(text(events)).toBe("Good thinking! Let's look at tens. What do you notice?");
	});

	it("stops before a sentence with wrong arithmetic", async () => {
		const events = await collect(["Nice. ", "Remember 6 × 7 = 48. ", "Now try."]);
		expect(events.at(-1)).toEqual({ type: "stopped", reason: "arithmetic", text: ` ${STOP_NOTICES.arithmetic}` });
		expect(text(events)).not.toContain("48");
	});

	it("stops before the pending answer is given away", async () => {
		const events = await collect(["Let's count up. ", "It makes 4,500 altogether."], ["4500"]);
		expect(events.at(-1)?.type).toBe("stopped");
		expect(events.at(-1)).toMatchObject({ reason: "answer_leak" });
		expect(text(events)).not.toContain("4,500");
	});

	it("stops a reply that runs too long, even without a sentence break", async () => {
		const events = await collect(["a".repeat(80)], [], 50);
		expect(events).toEqual([{ type: "stopped", reason: "too_long", text: STOP_NOTICES.too_long }]);
	});
});
