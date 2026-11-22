import type { ReactNode } from "react";
import { SUBJECTS } from "#/components/lesson-visual";
import { formatDate } from "#/components/status";
import type { ProgrammeReport, ReportStep, ReworkReason } from "#/server/services/programme-report";

type Rework = ProgrammeReport["toRework"][number];

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function reasonLabel(reason: ReworkReason, step: Rework): string {
	switch (reason) {
		case "needs_review":
			return "Slipped since it was secured";
		case "regression":
			return `Dropped back ${plural(step.regressions, "time")} after being secured`;
		case "stuck":
			return `Stuck: ${plural(step.failedAssessments, "failed check")} on their own in a row`;
		case "overdue_review":
			return step.daysOverdue ? `Review overdue by ${plural(step.daysOverdue, "day")}` : "Review overdue";
	}
}

export function backlogLine(r: Pick<ProgrammeReport, "reviewBacklog">): string | null {
	const { due, deferred } = r.reviewBacklog;
	if (deferred === 0) return null;
	return `${plural(due, "review")} due. Nova spaces reviews between new steps, so ${plural(deferred, "review")} ${deferred === 1 ? "waits" : "wait"} for a later mission.`;
}

export function extrasLine(r: Pick<ProgrammeReport, "extras">): string | null {
	const { sessions, objectives, accuracy } = r.extras;
	if (sessions === 0) return null;
	const titles = objectives.map((o) => o.title).join(", ");
	const score =
		accuracy.total === 0
			? "no answers recorded"
			: accuracy.rate === null
				? `${accuracy.passed} of ${accuracy.total} answers right`
				: `${Math.round(accuracy.rate * 100)}% of answers right`;
	return `Extra practice: ${plural(sessions, "session")} on ${titles} · ${score}. Extra practice does not move the programme.`;
}

function positionSentence(r: ProgrammeReport): string {
	const name = r.student.displayName;
	const { unit, step, complete, total } = r.position;
	if (complete || !unit || !step) return `${name} has finished the Year ${r.student.yearGroup} programme.`;
	return `${name} is on unit ${unit.number} of ${unit.total}, ${unit.title}: step ${step.number} of ${total}, ${step.title}.`;
}

function securedLine(r: ProgrammeReport): string {
	const { done, total, progress } = r.position;
	const percent = progress.rate === null ? "" : ` (${Math.round(progress.rate * 100)}%)`;
	return `${done} of ${total} steps secured${percent}.`;
}

function activityLine(r: ProgrammeReport): string {
	if (!r.lastActivityAt) return "No mission done yet.";
	return `Last activity ${formatDate(r.lastActivityAt)} · ${plural(r.missionsLast7Days, "mission")} in the last 7 days.`;
}

function EvidenceLink({ step }: { step: ReportStep }) {
	return (
		<a className="link" href={`#evidence-${step.code}`}>
			{step.title}
		</a>
	);
}

function ReportList({
	id,
	title,
	empty,
	count,
	children,
}: {
	id: string;
	title: string;
	empty: string;
	count: number;
	children: ReactNode;
}) {
	return (
		<section aria-labelledby={`${id}-title`} className="card space-y-3" data-testid={id}>
			<h3 id={`${id}-title`} className="font-display text-lg font-semibold">
				{title}
			</h3>
			{count === 0 ? <p className="text-sm text-ink-soft">{empty}</p> : <ul className="space-y-2">{children}</ul>}
		</section>
	);
}

export function ProgrammeReportView({ report: r }: { report: ProgrammeReport }) {
	const name = r.student.displayName;
	const currentCode = r.position.step?.code;
	const backlog = backlogLine(r);
	const extras = extrasLine(r);
	return (
		<section aria-labelledby="report-title" className="space-y-4" data-testid="programme-report">
			<div className="space-y-1">
				<h2 id="report-title" className="h2">
					Where {name} is
				</h2>
				<p className="text-lg" data-testid="report-position" data-step={currentCode ?? "complete"}>
					{positionSentence(r)}
				</p>
				<p className="text-ink-soft" data-testid="report-secured">
					{securedLine(r)} {activityLine(r)}
				</p>
				{backlog && (
					<p className="text-sm text-ink-soft" data-testid="report-review-backlog">
						{backlog}
					</p>
				)}
				{extras && (
					<p className="text-sm text-ink-soft" data-testid="report-extras">
						{extras}
					</p>
				)}
				{r.truncated && (
					<p className="note-hint text-sm">Only the most recent activity is counted; older missions are left out.</p>
				)}
			</div>

			<ol className="grid gap-2 sm:grid-cols-2" aria-label="Programme by unit" data-testid="report-units">
				{r.units.map((u) => (
					<li
						key={u.id}
						className="stat space-y-2"
						data-testid={`report-unit-${u.id}`}
						aria-current={u.current ? "step" : undefined}
					>
						<div className="flex items-baseline justify-between gap-2">
							<p className="text-sm text-ink-mute">
								Unit {u.number} · {SUBJECTS[u.subject]}
							</p>
							{u.current && <span className="chip">Now</span>}
							{!u.current && u.done === u.total && <span className="chip">Complete</span>}
						</div>
						<p className="font-semibold">{u.title}</p>
						<div
							className="h-1.5 overflow-hidden rounded-full bg-brand-soft"
							role="progressbar"
							aria-label={`${u.title}: ${u.done} of ${u.total} steps secured`}
							aria-valuemin={0}
							aria-valuemax={u.total}
							aria-valuenow={u.done}
						>
							<div className="h-full bg-brand" style={{ width: `${(u.done / Math.max(1, u.total)) * 100}%` }} />
						</div>
						<p className="text-sm text-ink-soft">
							{u.done} of {u.total} steps
						</p>
					</li>
				))}
			</ol>

			<div className="grid gap-3 md:grid-cols-3">
				<ReportList
					id="report-acquired"
					title="Acquired"
					count={r.acquired.length}
					empty={`Nothing secured yet. Steps appear here once ${name} secures them in a mission.`}
				>
					{r.acquired.map((s) => (
						<li key={s.code} data-testid={`acquired-${s.code}`}>
							<EvidenceLink step={s} />
							{s.securedAt && <span className="block text-xs text-ink-mute">Secured {formatDate(s.securedAt)}</span>}
						</li>
					))}
				</ReportList>
				<ReportList id="report-rework" title="To rework" count={r.toRework.length} empty="Nothing to rework.">
					{r.toRework.map((s) => (
						<li key={s.code} data-testid={`rework-${s.code}`}>
							<EvidenceLink step={s} />
							<ul className="text-sm text-ink-soft" aria-label="Why">
								{s.reasons.map((reason) => (
									<li key={reason} data-reason={reason}>
										{reasonLabel(reason, s)}
									</li>
								))}
							</ul>
						</li>
					))}
				</ReportList>
				<ReportList
					id="report-next"
					title="Coming next"
					count={r.next.length}
					empty={`No step left: ${name} has reached the end of the programme.`}
				>
					{r.next.map((s) => (
						<li key={s.code} data-testid={`next-${s.code}`}>
							<EvidenceLink step={s} />
							{s.code === currentCode && <span className="block text-xs text-ink-mute">Today's mission</span>}
						</li>
					))}
				</ReportList>
			</div>
		</section>
	);
}
