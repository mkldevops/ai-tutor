import type { AppConfig } from "../config";
import type { RateLimiter } from "../rate-limit";
import type { BaseRecord, DataStore, Filter, Table } from "../store/types";
import { audit } from "./family";

const DAY = 24 * 60 * 60 * 1000;

export type RetentionPolicy = {
	openSessionDays: number;
	worksheetCheckDays: number;
	auditLogDays: number;
	evidenceDays: number;
	sessionMessageDays: number;
};

export const DEFAULT_RETENTION: RetentionPolicy = {
	openSessionDays: 30,
	worksheetCheckDays: 90,
	auditLogDays: 400,
	evidenceDays: 0,
	sessionMessageDays: 30,
};

export function retentionPolicy(config: AppConfig): RetentionPolicy {
	return {
		openSessionDays: config.RETENTION_OPEN_SESSION_DAYS,
		worksheetCheckDays: config.RETENTION_WORKSHEET_CHECK_DAYS,
		auditLogDays: config.RETENTION_AUDIT_LOG_DAYS,
		evidenceDays: config.RETENTION_EVIDENCE_DAYS,
		sessionMessageDays: config.RETENTION_SESSION_MESSAGES_DAYS,
	};
}

export type PurgeStep =
	| "open_sessions"
	| "worksheet_checks"
	| "session_messages"
	| "audit_logs"
	| "rate_limits"
	| "evidence_sessions"
	| "evidence_attempts"
	| "evidence_mastery_events"
	| "evidence_revision_schedules";

export type PurgeReport = {
	dryRun: boolean;
	at: string;
	policy: RetentionPolicy;
	counts: Partial<Record<PurgeStep, number>>;
	truncated: PurgeStep[];
};

type Options = { dryRun: boolean; maxPerStep?: number; now?: Date };

const PAGE = 100;

type Sweep<T extends BaseRecord> = {
	table: Table<T>;
	filter: Filter<T>;
	createdBefore: string;
	max: number;
	keep?: (row: T) => boolean;
};

type SweepResult = { count: number; truncated: boolean };

const isNotFound = (e: unknown) => (e as { code?: number }).code === 404;

class PurgeFailed extends Error {
	constructor(
		readonly step: PurgeStep,
		cause: unknown,
	) {
		super(cause instanceof Error ? cause.message : String(cause), { cause });
	}
}

async function previewSweep<T extends BaseRecord>(s: Sweep<T>, selected: Set<string>): Promise<SweepResult> {
	const rows = (await s.table.list(s.filter, { createdBefore: s.createdBefore, limit: s.max + selected.size + 1 }))
		.filter((r) => !selected.has(r.id))
		.filter((r) => !s.keep?.(r));
	const picked = rows.slice(0, s.max);
	for (const r of picked) selected.add(r.id);
	return { count: picked.length, truncated: rows.length > s.max };
}

async function deleteSweep<T extends BaseRecord>(s: Sweep<T>, onDelete: () => void): Promise<SweepResult> {
	let count = 0;
	const skipped = new Set<string>();
	while (count < s.max) {
		const rows = (
			await s.table.list(s.filter, {
				createdBefore: s.createdBefore,
				limit: Math.min(PAGE, s.max - count) + skipped.size,
			})
		).filter((r) => !skipped.has(r.id));
		if (rows.length === 0) return { count, truncated: false };
		for (const r of rows.slice(0, s.max - count)) {
			if (s.keep) {
				const fresh = await s.table.get(r.id);
				if (!fresh) continue;
				if (s.keep(fresh)) {
					skipped.add(r.id);
					continue;
				}
			}
			try {
				await s.table.delete(r.id);
			} catch (e) {
				if (isNotFound(e)) continue;
				throw e;
			}
			count += 1;
			onDelete();
		}
	}
	const more = (await s.table.list(s.filter, { createdBefore: s.createdBefore, limit: skipped.size + 1 })).filter(
		(r) => !skipped.has(r.id),
	);
	return { count, truncated: more.length > 0 };
}

const cutoff = (now: Date, days: number) => new Date(now.getTime() - days * DAY).toISOString();

export async function purgeExpiredData(
	deps: { store: DataStore; rateLimiter?: RateLimiter },
	policy: RetentionPolicy,
	opts: Options,
): Promise<PurgeReport> {
	const { store } = deps;
	const now = opts.now ?? new Date();
	const max = opts.maxPerStep ?? 5000;
	const report: PurgeReport = { dryRun: opts.dryRun, at: now.toISOString(), policy, counts: {}, truncated: [] };
	const selected = new Map<unknown, Set<string>>();
	const selectedIn = (table: unknown) => {
		const set = selected.get(table) ?? new Set<string>();
		selected.set(table, set);
		return set;
	};

	const run = async <T extends BaseRecord>(step: PurgeStep, s: Sweep<T>): Promise<SweepResult> => {
		report.counts[step] ??= 0;
		try {
			const bump = (n: number) => {
				report.counts[step] = (report.counts[step] ?? 0) + n;
			};
			const r = opts.dryRun ? await previewSweep(s, selectedIn(s.table)) : await deleteSweep(s, () => bump(1));
			if (opts.dryRun) bump(r.count);
			if (r.truncated && !report.truncated.includes(step)) report.truncated.push(step);
			return r;
		} catch (e) {
			throw new PurgeFailed(step, e);
		}
	};

	const steps = async () => {
		await run("open_sessions", {
			table: store.learning_sessions,
			filter: { completedAt: null },
			createdBefore: cutoff(now, policy.openSessionDays),
			max,
			keep: (row) => row.completedAt !== null,
		});
		await run("worksheet_checks", {
			table: store.worksheet_checks,
			filter: {},
			createdBefore: cutoff(now, policy.worksheetCheckDays),
			max,
		});

		await run("session_messages", {
			table: store.session_messages,
			filter: {},
			createdBefore: cutoff(now, policy.sessionMessageDays),
			max,
		});

		if (policy.evidenceDays > 0) {
			const createdBefore = cutoff(now, policy.evidenceDays);
			await run("evidence_sessions", { table: store.learning_sessions, filter: {}, createdBefore, max });
			await run("evidence_attempts", { table: store.assessment_attempts, filter: {}, createdBefore, max });
			await run("evidence_mastery_events", { table: store.mastery_events, filter: {}, createdBefore, max });
			const done = await run("evidence_revision_schedules", {
				table: store.revision_schedules,
				filter: { status: "done" },
				createdBefore,
				max,
			});
			await run("evidence_revision_schedules", {
				table: store.revision_schedules,
				filter: { status: "superseded" },
				createdBefore,
				max: max - done.count,
			});
		}

		await run("audit_logs", {
			table: store.audit_logs,
			filter: {},
			createdBefore: cutoff(now, policy.auditLogDays),
			max,
		});

		if (deps.rateLimiter && !opts.dryRun) {
			try {
				const purged = await deps.rateLimiter.purgeExpired(now.getTime(), max);
				report.counts.rate_limits = purged;
				if (purged >= max) report.truncated.push("rate_limits");
			} catch (e) {
				throw new PurgeFailed("rate_limits", e);
			}
		}
	};

	try {
		await steps();
	} catch (e) {
		if (!opts.dryRun && e instanceof PurgeFailed) {
			await audit(store, { userId: null, familyId: null }, "retention.purge", "retention", {
				policy,
				counts: report.counts,
				truncated: report.truncated,
				failed: { step: e.step, error: e.message },
			}).catch((auditError) => console.error("[ai-tutor] retention audit failed", auditError));
		}
		throw e instanceof PurgeFailed ? e.cause : e;
	}

	if (!opts.dryRun) {
		await audit(store, { userId: null, familyId: null }, "retention.purge", "retention", {
			policy,
			counts: report.counts,
			truncated: report.truncated,
		});
	}
	return report;
}
