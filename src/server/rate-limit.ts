import { AppError } from "./services/errors";

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): void {
	const bucket = buckets.get(key);
	if (!bucket || bucket.resetAt <= now) {
		buckets.set(key, { count: 1, resetAt: now + windowMs });
		if (buckets.size > 10_000) {
			for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
		}
		return;
	}
	bucket.count += 1;
	if (bucket.count > limit) throw new AppError("rate_limited", "Too many requests, please slow down.");
}

export function resetRateLimits() {
	buckets.clear();
}
