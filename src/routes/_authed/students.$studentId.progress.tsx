import { createFileRoute, useRouter } from "@tanstack/react-router";
import { ErrorBox, useAction } from "#/components/form";
import { formatDate, StatusBadge } from "#/components/status";
import { DONE, useProgress } from "#/components/student-progress";
import type { CompetencyStatus } from "#/domain/types";
import { overrideCompetencyFn } from "#/server/functions";

export const Route = createFileRoute("/_authed/students/$studentId/progress")({
	component: ProgressTab,
});

const STATUSES: CompetencyStatus[] = ["emerging", "developing", "secure", "mastered", "needs_review"];
const MODES = ["diagnostic", "guided", "independent", "review"] as const;

function ProgressTab() {
	const { student, objectives, events } = useProgress();
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
