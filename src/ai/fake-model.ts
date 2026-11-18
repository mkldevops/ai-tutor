import type { LanguageModel } from "@mastra/core/llm";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";

export const FAKE_REPLY = [
	"Good thinking! ",
	"Let's look at place value together. ",
	"Each digit moves when we change the number. ",
	"What did you notice about the tens digit?",
];

const usage = {
	inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
	outputTokens: { total: 0, text: 0, reasoning: 0 },
};

export function fakeStreamParts(deltas: string[]) {
	return [
		{ type: "stream-start" as const, warnings: [] },
		{ type: "text-start" as const, id: "t" },
		...deltas.map((delta) => ({ type: "text-delta" as const, id: "t", delta })),
		{ type: "text-end" as const, id: "t" },
		{ type: "finish" as const, finishReason: { unified: "stop" as const, raw: "stop" }, usage },
	];
}

export function createFakeTutorModel(deltas: string[] = FAKE_REPLY, chunkDelayInMs = 40): LanguageModel {
	const model = new MockLanguageModelV4({
		provider: "fake",
		modelId: "tutor",
		doStream: async () => ({
			stream: simulateReadableStream({ chunks: fakeStreamParts(deltas), chunkDelayInMs }),
		}),
	});
	return model as unknown as LanguageModel;
}
