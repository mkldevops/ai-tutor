import { describe, expect, it } from "vitest";
import { parseReading, ReadingFailed, readWorksheet, type VisionMessage } from "./worksheet-reader";

const reply = {
	imageQuality: "good",
	items: [{ question: "6 × 7 =", childAnswer: "42", legibility: "clear" }],
	handwriting: { note: "Neat digits.", confidence: "medium" },
};

describe("worksheet reader", () => {
	it("parses JSON even when wrapped in prose or a code fence", () => {
		expect(parseReading(`Sure:\n\`\`\`json\n${JSON.stringify(reply)}\n\`\`\``)).toEqual(reply);
	});

	it("rejects replies that break the schema", () => {
		expect(() => parseReading("no json")).toThrow(ReadingFailed);
		expect(() => parseReading(JSON.stringify({ ...reply, imageQuality: "great" }))).toThrow(ReadingFailed);
		const many = { ...reply, items: Array.from({ length: 31 }, () => reply.items[0]) };
		expect(() => parseReading(JSON.stringify(many))).toThrow(ReadingFailed);
	});

	it("sends the image as a typed part and retries once on a bad reply", async () => {
		const calls: VisionMessage[][] = [];
		const replies = ["garbage", JSON.stringify(reply)];
		const res = await readWorksheet(
			async (m) => {
				calls.push(m);
				return { text: replies.shift() ?? "" };
			},
			{ bytes: Uint8Array.from([1, 2]), mimeType: "image/png" },
		);
		expect(res).toEqual(reply);
		expect(calls).toHaveLength(2);
		expect(calls[0]?.[0]?.content[1]).toMatchObject({ type: "image", mediaType: "image/png" });
	});

	it("gives up after two bad replies", async () => {
		await expect(
			readWorksheet(async () => ({ text: "{}" }), { bytes: Uint8Array.from([1]), mimeType: "image/png" }),
		).rejects.toBeInstanceOf(ReadingFailed);
	});
});
