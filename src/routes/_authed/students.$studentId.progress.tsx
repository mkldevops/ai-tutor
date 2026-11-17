import { createFileRoute, useRouter } from "@tanstack/react-router";
import { ErrorBox, useAction } from "#/components/form";
import { formatDate, StatusBadge } from "#/components/status";
import { DONE, type Objective, type Progress, useProgress } from "#/components/student-progress";
import type { CompetencyStatus } from "#/domain/types";
import { overrideCompetencyFn } from "#/server/functions";

export const Route = createFileRoute("/_authed/students/$studentId/progress")({
	component: ProgressTab,
});

const STATUSES: CompetencyStatus[] = ["emerging", "developing", "secure", "mastered", "needs_review"];
const MODES = ["diagnostic", "guided", "independent", "review"] as const;

function ProgressTab() {
	const { student, objectives, events, outcomes } = useProgress();
	const stats = [
		{ label: "Objectives", value: objectives.length },
		{ label: "Secure or better", value: objectives.filter((o) => DONE.includes(o.status)).length },
		{
			label: "In progress",
			value: objectives.filter((o) => !DONE.includes(o.status) && o.status !== "not_started").length,
		},
		{ label: "Reviews due", value: objectives.filter((o) => o.review?.isDue).length },
	];

	return (
		<div className="space-y-6">
			<section aria-label="Progress summary" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
				{stats.map((s) => (
					<div key={s.label} className="stat">
						<p className="text-sm text-ink-mute">{s.label}</p>
						<p className="stat-value">{s.value}</p>
					</div>
				))}
			</section>

			<LearningOutcomes outcomes={outcomes} objectives={objectives} />

			<section aria-labelledby="evidence-title" className="space-y-3">
				<h2 id="evidence-title" className="h2">
					Evidence by objective
				</h2>
				{objectives.map((o) => (
					<article key={o.code} className="card space-y-4" data-testid={`evidence-${o.code}`}>
						<div className="flex flex-wrap items-start justify-between gap-3">
							<div className="max-w-xl">
								<p className="meta">
									{o.strand} · {o.code}
								</p>
								<p className="mt-2 font-display text-lg leading-snug">{o.statement}</p>
							</div>
							<StatusBadge status={o.status} />
						</div>

						<dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
							{MODES.map((m) => (
								<div key={m} className="rounded-lg border border-line px-3 py-2">
									<dt className="text-xs text-ink-mute capitalize">{m}</dt>
									<dd className="font-display text-xl">
										{o.evidence[m].correct}
										<span className="text-sm text-ink-mute"> / {o.evidence[m].items}</span>
									</dd>
								</div>
							))}
						</dl>

						{o.reasons.length > 0 && (
							<ul className="list-disc space-y-1 pl-5 text-sm text-ink-soft">
								{o.reasons.map((r) => (
									<li key={r}>{r}</li>
								))}
							</ul>
						)}
						<ObjectiveHistory history={o.history} code={o.code} />

						{o.override && (
							<p className="note-hint text-sm">
								Parent override: {o.override.status} — “{o.override.reason}” (computed: {o.computedStatus})
							</p>
						)}

						<details className="text-sm">
							<summary className="cursor-pointer font-medium text-ink-soft">Source and manual status</summary>
							<p className="mt-3 text-xs text-ink-mute">
								Source: {o.source.publisher}, {o.source.title} ({o.source.reference}).{" "}
								<a className="link" href={o.source.url} target="_blank" rel="noreferrer">
									View source
								</a>{" "}
								· {o.source.licence}
							</p>
							<OverrideForm studentId={student.id} objectiveCode={o.code} hasOverride={!!o.override} />
						</details>
					</article>
				))}
			</section>

			<section className="card">
				<h2 className="h2 mb-3">Recent changes</h2>
				{events.length === 0 ? (
					<p className="text-sm text-ink-soft">No status changes yet. They appear here after each lesson.</p>
				) : (
					<ul className="space-y-1 text-sm">
						{events.map((e) => (
							<li key={e.id}>
								{formatDate(e.createdAt)} · {e.objectiveCode}: {e.fromStatus} → <strong>{e.toStatus}</strong>
								{e.reason ? ` (${e.reason})` : ""}
							</li>
						))}
					</ul>
				)}
			</section>
		</div>
	);
}

const CALIBRATION_LABEL = {
	matches: "Matched results",
	over: "Felt more sure than results",
	under: "Did better than felt",
} as const;

const percent = (x: number) => `${Math.round(x * 100)}%`;

function LearningOutcomes({ outcomes, objectives }: { outcomes: Progress["outcomes"]; objectives: Objective[] }) {
	const { reviews, confidence } = outcomes;
	const title = (code: string) => objectives.find((o) => o.code === code)?.title ?? code;
	return (
		<section aria-labelledby="outcomes-title" className="card space-y-4" data-testid="outcomes">
			<h2 id="outcomes-title" className="h2">
				Learning outcomes
			</h2>
			<div className="grid gap-3 sm:grid-cols-2">
				<div className="rounded-lg border border-line px-3 py-2" data-testid="outcomes-retention">
					<p className="text-xs text-ink-mute">Remembered on delayed reviews</p>
					{reviews.completed === 0 ? (
						<p className="text-sm text-ink-soft">No review done yet.</p>
					) : (
						<p className="font-display text-xl">
							{reviews.held}
							<span className="text-sm text-ink-mute">
								{" "}
								/ {reviews.completed} reviews held · {percent(reviews.accuracy ?? 0)} correct
							</span>
						</p>
					)}
				</div>
				<div className="rounded-lg border border-line px-3 py-2" data-testid="outcomes-confidence">
					<p className="text-xs text-ink-mute">Confidence vs results</p>
					{confidence.checks.length === 0 ? (
						<p className="text-sm text-ink-soft">No confidence check-in yet.</p>
					) : (
						<p className="text-sm">
							{confidence.matches} matched · {confidence.over} more sure · {confidence.under} less sure
						</p>
					)}
				</div>
			</div>
			{confidence.checks.length > 0 && (
				<ul className="space-y-1 text-sm text-ink-soft" aria-label="Confidence check-ins">
					{confidence.checks.map((c) => (
						<li key={c.sessionId}>
							{formatDate(c.completedAt)} · {title(c.objectiveCode)}: felt {c.confidence} of 5, scored{" "}
							{percent(c.accuracy)} on their own · <strong>{CALIBRATION_LABEL[c.calibration]}</strong>
						</li>
					))}
				</ul>
			)}
			<p className="text-xs text-ink-mute">
				A review holds at 80% or more. Confidence is compared with answers given without help.
			</p>
		</section>
	);
}

function ObjectiveHistory({ history, code }: { history: Objective["history"]; code: string }) {
	const max = Math.max(1, ...history.weeks.map((w) => w.answers));
	const active = history.weeks.some((w) => w.answers > 0) || history.changes.length > 0;
	if (!active) return null;
	return (
		<div className="space-y-3 border-t border-line pt-4" data-testid={`history-${code}`}>
			<p className="text-xs font-medium text-ink-mute">Last 6 weeks</p>
			<ol className="flex h-16 items-end gap-2" aria-label="Answers per week">
				{history.weeks.map((w) => {
					const label = `Week of ${formatDate(w.start)}: ${w.correct} correct out of ${w.answers}`;
					return (
						<li key={w.start} className="flex flex-1 flex-col items-center gap-1" title={label} aria-label={label}>
							<div
								className="flex w-full flex-col-reverse overflow-hidden rounded-sm bg-brand-soft"
								style={{ height: `${(w.answers / max) * 48 + 2}px` }}
							>
								<div
									className="w-full bg-brand"
									style={{ height: w.answers ? `${(w.correct / w.answers) * 100}%` : "0%" }}
								/>
							</div>
							<span className="text-[10px] text-ink-mute">{w.answers || "·"}</span>
						</li>
					);
				})}
			</ol>
			{history.changes.length > 0 && (
				<ol className="space-y-1 text-sm text-ink-soft" aria-label="Status history">
					{history.changes.map((c) => (
						<li key={`${c.at}-${c.toStatus}`}>
							{formatDate(c.at)} · {c.fromStatus} → <strong>{c.toStatus}</strong>
							{c.actor === "parent" ? " (parent)" : ""}
						</li>
					))}
				</ol>
			)}
		</div>
	);
}

function OverrideForm({
	studentId,
	objectiveCode,
	hasOverride,
}: {
	studentId: string;
	objectiveCode: string;
	hasOverride: boolean;
}) {
	const router = useRouter();
	const action = useAction(async (form: HTMLFormElement) => {
		const data = new FormData(form);
		const raw = String(data.get("status"));
		await overrideCompetencyFn({
			data: {
				studentId,
				objectiveCode,
				status: raw === "clear" ? null : (raw as CompetencyStatus),
				reason: String(data.get("reason")),
			},
		});
		form.reset();
		await router.invalidate();
	});
	return (
		<form
			className="mt-4 grid gap-2 border-t border-line pt-4 sm:grid-cols-[auto_1fr_auto]"
			onSubmit={(e) => {
				e.preventDefault();
				void action.run(e.currentTarget);
			}}
		>
			<select name="status" className="input" aria-label="Override status" defaultValue="secure">
				{STATUSES.map((s) => (
					<option key={s} value={s}>
						{s}
					</option>
				))}
				{hasOverride && <option value="clear">clear override</option>}
			</select>
			<input name="reason" className="input" placeholder="Reason (required)" minLength={3} required />
			<button type="submit" className="btn-secondary" disabled={action.pending}>
				Override
			</button>
			<div className="sm:col-span-3">
				<ErrorBox error={action.error} />
			</div>
		</form>
	);
}
