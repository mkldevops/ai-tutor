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

describe("VISION", () => {
	it("defaults to off with the cheapest vision model", () => {
		const c = loadConfig({});
		expect(c.VISION_ENABLED).toBe(false);
		expect(c.VISION_MODEL).toBe("openrouter/deepseek/deepseek-v4.1-flash");
	});

	it("requires the AI key when vision is on", () => {
		expect(() => loadConfig({ VISION_ENABLED: "true" })).toThrow(/AI_API_KEY/);
		expect(loadConfig({ VISION_ENABLED: "true", AI_API_KEY: "k" }).VISION_ENABLED).toBe(true);
	});
});
