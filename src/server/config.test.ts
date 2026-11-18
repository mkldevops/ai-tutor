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

describe("rate limit backend", () => {
	const appwrite = {
		DATA_BACKEND: "appwrite",
		APPWRITE_ENDPOINT: "https://appwrite.example.test/v1",
		APPWRITE_PROJECT_ID: "p",
		APPWRITE_API_KEY: "k",
	};

	it("follows the data backend by default", () => {
		expect(loadConfig({}).RATE_LIMIT_BACKEND).toBe("memory");
		expect(loadConfig(appwrite).RATE_LIMIT_BACKEND).toBe("appwrite");
		expect(loadConfig({ ...appwrite, RATE_LIMIT_BACKEND: "memory" }).RATE_LIMIT_BACKEND).toBe("memory");
	});

	it("refuses shared limits without Appwrite data", () => {
		expect(() => loadConfig({ RATE_LIMIT_BACKEND: "appwrite" })).toThrow(/RATE_LIMIT_BACKEND/);
	});
});

describe("retention", () => {
	it("defaults to a dry run that keeps mastery evidence", () => {
		const c = loadConfig({});
		expect(c.RETENTION_PURGE_ENABLED).toBe(false);
		expect(c.RETENTION_OPEN_SESSION_DAYS).toBe(30);
		expect(c.RETENTION_WORKSHEET_CHECK_DAYS).toBe(90);
		expect(c.RETENTION_AUDIT_LOG_DAYS).toBe(400);
		expect(c.RETENTION_EVIDENCE_DAYS).toBe(0);
	});

	it("only allows an evidence window of at least a year", () => {
		expect(() => loadConfig({ RETENTION_EVIDENCE_DAYS: "90" })).toThrow(/RETENTION_EVIDENCE_DAYS/);
		expect(loadConfig({ RETENTION_EVIDENCE_DAYS: "730" }).RETENTION_EVIDENCE_DAYS).toBe(730);
	});

	it("keeps audit logs for at least 30 days", () => {
		expect(() => loadConfig({ RETENTION_AUDIT_LOG_DAYS: "7" })).toThrow(/RETENTION_AUDIT_LOG_DAYS/);
	});
});
