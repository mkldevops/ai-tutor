import { createHash } from "node:crypto";
import { AppError } from "./services/errors";

export type RateLimiter = {
	readonly kind: "memory" | "appwrite";
	hit(key: string, windowMs: number, now: number): Promise<number>;
	purgeExpired(now: number, max?: number): Promise<number>;
};

export function windowStart(windowMs: number, now: number): number {
	return Math.floor(now / windowMs) * windowMs;
}

export function bucketId(key: string, windowMs: number, now: number): string {
	return createHash("sha256")
		.update(`${key}\n${windowMs}\n${windowStart(windowMs, now)}`)
		.digest("hex")
		.slice(0, 36);
}

export function createMemoryRateLimiter(): RateLimiter & { reset(): void } {
	const buckets = new Map<string, { count: number; expiresAt: number }>();
	const purge = (now: number, max = Number.POSITIVE_INFINITY) => {
		let n = 0;
		for (const [k, b] of buckets) {
			if (n >= max) break;
			if (b.expiresAt <= now) {
				buckets.delete(k);
				n += 1;
			}
		}
		return n;
	};
	return {
		kind: "memory",
		async hit(key, windowMs, now) {
			const id = bucketId(key, windowMs, now);
			const bucket = buckets.get(id);
			if (bucket) {
				bucket.count += 1;
				return bucket.count;
			}
			buckets.set(id, { count: 1, expiresAt: windowStart(windowMs, now) + windowMs });
			if (buckets.size > 10_000) purge(now);
			return 1;
		},
		async purgeExpired(now, max) {
			return purge(now, max);
		},
		reset() {
			buckets.clear();
		},
	};
}

const KEY = Symbol.for("ai-tutor.rate-limiter");
type Holder = { [KEY]?: RateLimiter };
const fallback = createMemoryRateLimiter();

export function setRateLimiter(limiter: RateLimiter | undefined) {
	(globalThis as Holder)[KEY] = limiter;
}

export function currentRateLimiter(): RateLimiter {
	return (globalThis as Holder)[KEY] ?? fallback;
}

export async function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): Promise<void> {
	const count = await currentRateLimiter().hit(key, windowMs, now);
	if (count > limit) throw new AppError("rate_limited", "Too many requests, please slow down.");
}

export function resetRateLimits() {
	fallback.reset();
	setRateLimiter(undefined);
}
