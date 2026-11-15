import { describe, expect, it } from "vitest";
import { loadConfig } from "./config";

describe("AI_MODEL", () => {
	it.each([
		"anthropic/claude-sonnet-5-5",
		"openrouter/deepseek/deepseek-v4-pro-0813",
		"openrouter/deepseek/deepseek-v4-flash-0731:thinking",
	])("accepts the model-router id %s", (AI_MODEL) => {
		expect(loadConfig({ AI_MODEL }).AI_MODEL).toBe(AI_MODEL);
	});

	it.each(["claude", "openrouter/", "/deepseek", "openrouter//x", "openrouter/a b"])("rejects %s", (AI_MODEL) => {
		expect(() => loadConfig({ AI_MODEL })).toThrow(/AI_MODEL/);
	});
});
