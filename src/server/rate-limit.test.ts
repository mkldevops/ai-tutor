import { afterEach, describe, expect, it } from "vitest";
import {
	bucketId,
	clientIp,
	createMemoryRateLimiter,
	currentRateLimiter,
	rateLimit,
	resetRateLimits,
	setRateLimiter,
	windowStart,
} from "./rate-limit";

const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 18, 10, 0, 0);

afterEach(() => resetRateLimits());

describe("rate limit buckets", () => {
	it("aligns windows and hashes the key so it is never stored raw", () => {
		expect(windowStart(MIN, T0 + 59_999)).toBe(T0);
		expect(windowStart(MIN, T0 + MIN)).toBe(T0 + MIN);
		const id = bucketId("signin:parent@example.com", MIN, T0);
		expect(id).toMatch(/^[0-9a-f]{36}$/);
		expect(id).not.toContain("example");
		expect(bucketId("signin:parent@example.com", MIN, T0 + 1000)).toBe(id);
		expect(bucketId("signin:parent@example.com", MIN, T0 + MIN)).not.toBe(id);
	});
});

describe("memory rate limiter", () => {
	it("counts hits per key and window, then starts again in the next window", async () => {
		const limiter = createMemoryRateLimiter();
		expect(await limiter.hit("a", MIN, T0)).toBe(1);
		expect(await limiter.hit("a", MIN, T0 + 10)).toBe(2);
		expect(await limiter.hit("b", MIN, T0 + 10)).toBe(1);
		expect(await limiter.hit("a", MIN, T0 + MIN)).toBe(1);
	});

	it("purges only expired buckets, up to the given maximum", async () => {
		const limiter = createMemoryRateLimiter();
		await limiter.hit("a", MIN, T0);
		await limiter.hit("b", MIN, T0);
		await limiter.hit("c", MIN, T0 + MIN);
		expect(await limiter.purgeExpired(T0 + MIN - 1)).toBe(0);
		expect(await limiter.purgeExpired(T0 + MIN, 1)).toBe(1);
		expect(await limiter.purgeExpired(T0 + MIN)).toBe(1);
		expect(await limiter.hit("c", MIN, T0 + MIN)).toBe(2);
	});
});

describe("rateLimit", () => {
	it("allows up to the limit and rejects the next call", async () => {
		for (let i = 0; i < 3; i++) await rateLimit("k", 3, MIN, T0);
		await expect(rateLimit("k", 3, MIN, T0)).rejects.toMatchObject({ code: "rate_limited" });
		await expect(rateLimit("k", 3, MIN, T0 + MIN)).resolves.toBeUndefined();
	});

	it("uses the installed shared limiter and falls back to memory after reset", async () => {
		const seen: string[] = [];
		setRateLimiter({
			kind: "appwrite",
			async hit(key) {
				seen.push(key);
				return 99;
			},
			async purgeExpired() {
				return 0;
			},
		});
		expect(currentRateLimiter().kind).toBe("appwrite");
		await expect(rateLimit("shared", 5, MIN, T0)).rejects.toMatchObject({ code: "rate_limited" });
		expect(seen).toEqual(["shared"]);
		resetRateLimits();
		expect(currentRateLimiter().kind).toBe("memory");
		await expect(rateLimit("shared", 5, MIN, T0)).resolves.toBeUndefined();
	});
});

describe("clientIp", () => {
	it("keys on the hop the proxy appended, not a client-supplied one", () => {
		expect(clientIp("6.6.6.6, 203.0.113.9", "10.0.0.2")).toBe("203.0.113.9");
		expect(clientIp(" 203.0.113.9 ", undefined)).toBe("203.0.113.9");
	});

	it("falls back to the socket address, then a shared key", () => {
		expect(clientIp(undefined, "10.0.0.2")).toBe("10.0.0.2");
		expect(clientIp(" , ", undefined)).toBe("local");
	});
});
