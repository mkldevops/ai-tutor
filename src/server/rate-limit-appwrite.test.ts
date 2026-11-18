import { describe, expect, it } from "vitest";
import { createAppwriteRateLimiter, type RateLimitTables } from "./rate-limit-appwrite";

const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 18, 10, 0, 0);
const fail = (code: number) => Object.assign(new Error(`appwrite ${code}`), { code });

type Row = { $id: string; count: number; expiresAt: string };

function fakeDb(opts: { raceOnCreate?: boolean; failWith?: number } = {}) {
	const rows = new Map<string, Row>();
	const calls: string[] = [];
	const db = {
		async incrementRowColumn({ rowId, value }: { rowId: string; value?: number }) {
			calls.push("increment");
			if (opts.failWith) throw fail(opts.failWith);
			const row = rows.get(rowId);
			if (!row) throw fail(404);
			row.count += value ?? 1;
			return { ...row };
		},
		async createRow({ rowId, data }: { rowId: string; data: { count: number; expiresAt: string } }) {
			calls.push("create");
			if (opts.raceOnCreate) {
				rows.set(rowId, { $id: rowId, count: 1, expiresAt: data.expiresAt });
				throw fail(409);
			}
			rows.set(rowId, { $id: rowId, ...data });
			return rows.get(rowId);
		},
		async listRows({ queries }: { queries: string[] }) {
			const q = queries.map((s) => JSON.parse(s));
			const before = q.find((x) => x.method === "lessThan").values[0];
			const limit = q.find((x) => x.method === "limit").values[0];
			const hit = [...rows.values()].filter((r) => r.expiresAt < before).slice(0, limit);
			return { total: hit.length, rows: hit };
		},
		async deleteRow({ rowId }: { rowId: string }) {
			rows.delete(rowId);
			return {};
		},
	};
	return { db: db as unknown as RateLimitTables, rows, calls };
}

describe("Appwrite rate limiter", () => {
	it("creates the bucket on first hit, then increments it atomically", async () => {
		const { db, rows, calls } = fakeDb();
		const limiter = createAppwriteRateLimiter(db, "ai_tutor");
		expect(await limiter.hit("signin:x", MIN, T0)).toBe(1);
		expect(await limiter.hit("signin:x", MIN, T0 + 5)).toBe(2);
		expect(calls).toEqual(["increment", "create", "increment"]);
		const [row] = [...rows.values()];
		expect(row.expiresAt).toBe(new Date(T0 + MIN).toISOString());
		expect(row.$id).not.toContain("signin");
	});

	it("increments when another instance created the bucket first", async () => {
		const { db, calls } = fakeDb({ raceOnCreate: true });
		expect(await createAppwriteRateLimiter(db, "ai_tutor").hit("k", MIN, T0)).toBe(2);
		expect(calls).toEqual(["increment", "create", "increment"]);
	});

	it("fails closed on other Appwrite errors", async () => {
		const { db } = fakeDb({ failWith: 500 });
		await expect(createAppwriteRateLimiter(db, "ai_tutor").hit("k", MIN, T0)).rejects.toThrow(/500/);
	});

	it("purges expired buckets page by page and keeps live ones", async () => {
		const { db, rows } = fakeDb();
		const limiter = createAppwriteRateLimiter(db, "ai_tutor");
		for (let i = 0; i < 150; i++) await limiter.hit(`old-${i}`, MIN, T0);
		await limiter.hit("live", MIN, T0 + 2 * MIN);
		expect(await limiter.purgeExpired(T0 + 2 * MIN, 120)).toBe(120);
		expect(await limiter.purgeExpired(T0 + 2 * MIN)).toBe(30);
		expect(rows.size).toBe(1);
	});
});
