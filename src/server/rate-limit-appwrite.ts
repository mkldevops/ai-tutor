import { type Models, Query, type TablesDB } from "node-appwrite";
import { bucketId, type RateLimiter, windowStart } from "./rate-limit";

export const RATE_LIMIT_TABLE = "rate_limits";

const code = (e: unknown) => (e as { code?: number }).code;

type CountRow = { count?: number };

export type RateLimitTables = Pick<TablesDB, "incrementRowColumn" | "createRow" | "listRows" | "deleteRow">;

export function createAppwriteRateLimiter(db: RateLimitTables, databaseId: string): RateLimiter {
	const increment = async (rowId: string) => {
		const row = await db.incrementRowColumn<CountRow & Models.Row>({
			databaseId,
			tableId: RATE_LIMIT_TABLE,
			rowId,
			column: "count",
			value: 1,
		});
		return Number(row.count ?? 1);
	};
	return {
		kind: "appwrite",
		async hit(key, windowMs, now) {
			const rowId = bucketId(key, windowMs, now);
			try {
				return await increment(rowId);
			} catch (e) {
				if (code(e) !== 404) throw e;
			}
			try {
				await db.createRow({
					databaseId,
					tableId: RATE_LIMIT_TABLE,
					rowId,
					data: { count: 1, expiresAt: new Date(windowStart(windowMs, now) + windowMs).toISOString() },
					permissions: [],
				});
				return 1;
			} catch (e) {
				if (code(e) !== 409) throw e;
				return increment(rowId);
			}
		},
		async purgeExpired(now, max = 5000) {
			let purged = 0;
			while (purged < max) {
				const res = await db.listRows({
					databaseId,
					tableId: RATE_LIMIT_TABLE,
					queries: [Query.lessThan("expiresAt", new Date(now).toISOString()), Query.limit(Math.min(100, max - purged))],
				});
				if (res.rows.length === 0) break;
				for (const r of res.rows) {
					await db.deleteRow({ databaseId, tableId: RATE_LIMIT_TABLE, rowId: r.$id });
					purged += 1;
				}
			}
			return purged;
		},
	};
}
