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
};

export const DEFAULT_RETENTION: RetentionPolicy = {
	openSessionDays: 30,
	worksheetCheckDays: 90,
	auditLogDays: 400,
	evidenceDays: 0,
};

export function retentionPolicy(config: AppConfig): RetentionPolicy {
	return {
		openSessionDays: config.RETENTION_OPEN_SESSION_DAYS,
		worksheetCheckDays: config.RETENTION_WORKSHEET_CHECK_DAYS,
		auditLogDays: config.RETENTION_AUDIT_LOG_DAYS,
		evidenceDays: config.RETENTION_EVIDENCE_DAYS,
	};
}

export type PurgeStep =
	| "open_sessions"
	| "worksheet_checks"
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

async function sweep<T extends BaseRecord>(
	table: Table<T>,
	filter: Filter<T>,
	createdBefore: string,
	dryRun: boolean,
	max: number,
): Promise<{ count: number; truncated: boolean }> {
	if (dryRun) {
		const rows = await table.list(filter, { createdBefore, limit: max + 1 });
		return { count: Math.min(rows.length, max), truncated: rows.length > max };
	}
	let count = 0;
	while (count < max) {
		const rows = await table.list(filter, { createdBefore, limit: Math.min(PAGE, max - count) });
		if (rows.length === 0) return { count, truncated: false };
		for (const r of rows) await table.delete(r.id);
		count += rows.length;
	}
	const more = await table.list(filter, { createdBefore, limit: 1 });
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
	const record = (step: PurgeStep, r: { count: number; truncated: boolean }) => {
		report.counts[step] = r.count;
		if (r.truncated) report.truncated.push(step);
	};

	record(
		"open_sessions",
		await sweep(store.learning_sessions, { completedAt: null }, cutoff(now, policy.openSessionDays), opts.dryRun, max),
	);
	record(
		"worksheet_checks",
		await sweep(store.worksheet_checks, {}, cutoff(now, policy.worksheetCheckDays), opts.dryRun, max),
	);

	if (policy.evidenceDays > 0) {
		const before = cutoff(now, policy.evidenceDays);
		record("evidence_sessions", await sweep(store.learning_sessions, {}, before, opts.dryRun, max));
		record("evidence_attempts", await sweep(store.assessment_attempts, {}, before, opts.dryRun, max));
		record("evidence_mastery_events", await sweep(store.mastery_events, {}, before, opts.dryRun, max));
		const done = await sweep(store.revision_schedules, { status: "done" }, before, opts.dryRun, max);
		const superseded = await sweep(store.revision_schedules, { status: "superseded" }, before, opts.dryRun, max);
		record("evidence_revision_schedules", {
			count: done.count + superseded.count,
			truncated: done.truncated || superseded.truncated,
		});
	}

	record("audit_logs", await sweep(store.audit_logs, {}, cutoff(now, policy.auditLogDays), opts.dryRun, max));

	if (deps.rateLimiter && !opts.dryRun) {
		const purged = await deps.rateLimiter.purgeExpired(now.getTime(), max);
		record("rate_limits", { count: purged, truncated: purged >= max });
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
