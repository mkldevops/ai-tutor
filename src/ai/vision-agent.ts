import "@tanstack/react-start/server-only";
import { Agent } from "@mastra/core/agent";
import type { AppConfig } from "#/server/config";
import { type VisionGenerate, WORKSHEET_READER_INSTRUCTIONS } from "./worksheet-reader";

export function createWorksheetReader(config: AppConfig): { model: string; generate: VisionGenerate } | null {
	if (!config.VISION_ENABLED || !config.AI_API_KEY) return null;
	const agent = new Agent({
		id: "worksheet-reader",
		name: "Worksheet reader",
		instructions: WORKSHEET_READER_INSTRUCTIONS,
		model: { id: config.VISION_MODEL as `${string}/${string}`, apiKey: config.AI_API_KEY },
	});
	return {
		model: config.VISION_MODEL,
		generate: async (messages) => {
			const out = await agent.generate(messages as Parameters<typeof agent.generate>[0], { maxSteps: 1 });
			console.info("[ai-tutor] vision call", { model: config.VISION_MODEL, usage: out.usage });
			return { text: out.text };
		},
	};
}
