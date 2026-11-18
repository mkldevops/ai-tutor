import { describe, expect, it, vi } from "vitest";
import { createMemorySpeechCache } from "./cache";
import { speechKey, synthesize } from "./speech";

const mp3 = new Uint8Array([1, 2, 3]);

function deps(overrides = {}) {
	const fetch = vi.fn(async () => new Response(mp3, { status: 200 }));
	return {
		fetch,
		deps: {
			cache: createMemorySpeechCache(),
			apiKey: "test-key",
			voiceId: "voice123456",
			modelId: "eleven_flash_v2_5",
			fetch: fetch as unknown as typeof globalThis.fetch,
			...overrides,
		},
	};
}

describe("speech synthesis", () => {
	it("asks ElevenLabs once, then serves the cached clip", async () => {
		const { deps: d, fetch } = deps();
		expect(await synthesize(d, "What is  10 more than 184?")).toEqual(mp3);
		expect(await synthesize(d, "What is 10 more than 184?")).toEqual(mp3);
		expect(fetch).toHaveBeenCalledTimes(1);
		const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toContain("/v1/text-to-speech/voice123456");
		expect((init.headers as Record<string, string>)["xi-api-key"]).toBe("test-key");
		expect(JSON.parse(String(init.body))).toMatchObject({
			text: "What is 10 more than 184?",
			model_id: "eleven_flash_v2_5",
		});
	});

	it("returns nothing without an API key or for oversized text", async () => {
		const { deps: d, fetch } = deps({ apiKey: undefined });
		expect(await synthesize(d, "Hello")).toBeNull();
		const { deps: d2, fetch: fetch2 } = deps();
		expect(await synthesize(d2, "x".repeat(601))).toBeNull();
		expect(fetch).not.toHaveBeenCalled();
		expect(fetch2).not.toHaveBeenCalled();
	});

	it("checks the family budget only when a new clip is generated", async () => {
		const beforeGenerate = vi.fn();
		const { deps: d } = deps({ beforeGenerate });
		await synthesize(d, "Bravo!");
		await synthesize(d, "Bravo!");
		expect(beforeGenerate).toHaveBeenCalledTimes(1);
	});

	it("fails on an ElevenLabs error without caching it", async () => {
		const { deps: d } = deps({ fetch: vi.fn(async () => new Response("no", { status: 401 })) });
		await expect(synthesize(d, "Hello")).rejects.toThrow("401");
		expect(await d.cache.get(speechKey(d.voiceId, d.modelId, "Hello"))).toBeNull();
	});

	it("keys clips by voice and model", () => {
		expect(speechKey("a", "m", "Hi")).not.toBe(speechKey("b", "m", "Hi"));
		expect(speechKey("a", "m", "Hi")).toHaveLength(36);
	});
});
