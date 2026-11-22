import { createFileRoute, useRouter } from "@tanstack/react-router";
import { ErrorBox, useAction } from "#/components/form";
import { SUBJECTS } from "#/components/lesson-visual";
import { requireParentArea } from "#/components/parent-gate";
import { ProgrammeControls } from "#/components/programme-controls";
import { ProgrammeReportView } from "#/components/programme-report";
import { formatDate, STATUS_LABELS, StatusBadge } from "#/components/status";
import { DONE, type Objective, type Progress, useProgress } from "#/components/student-progress";
import { subjectsIn } from "#/components/subject-switch";
import type { CompetencyStatus } from "#/domain/types";
import { getProgrammeReportFn, overrideCompetencyFn } from "#/server/functions";

export const Route = createFileRoute("/_authed/students/$studentId/progress")({
	beforeLoad: requireParentArea,
	loader: ({ params }) => getProgrammeReportFn({ data: { studentId: params.studentId } }),
	component: ProgressTab,
});

const STATUSES: CompetencyStatus[] = ["emerging", "developing", "secure", "mastered", "needs_review"];
const MODES = [
	["diagnostic", "First check"],
	["guided", "With help"],
	["independent", "On their own"],
	["review", "Later review"],
] as const;

const STATUS_HINT: Record<CompetencyStatus, string> = {
	not_started: "Not started yet.",
	emerging: "Just started. Needs more practice with help.",
	developing: "Getting there. A bit more practice on their own will make it stick.",
	secure: "Can do it alone. A later review will check that it lasts.",
	mastered: "Solid, and still remembered at the review.",
	needs_review: "Slipped a little since last time. A review will refresh it.",
};

function ProgressTab() {
	const { student, objectives, events, outcomes } = useProgress();
	const report = Route.useLoaderData();
	const started = objectives.filter((o) => o.status !== "not_started");
	const waiting = objectives.filter((o) => o.status === "not_started");
	const secured = objectives.filter((o) => DONE.includes(o.status)).length;
	const due = objectives.filter((o) => o.review?.isDue).length;
	const title = (code: string) => objectives.find((o) => o.code === code)?.title ?? code;
	const bySubject = subjectsIn(objectives).map((subject) => {
		const own = objectives.filter((o) => o.subject === subject);
		return {
			subject,
			total: own.length,
			secured: own.filter((o) => DONE.includes(o.status)).length,
			due: own.filter((o) => o.review?.isDue).length,
		};
	});
	const stats = [
		{ label: "Secured", value: secured, of: objectives.length },
		{ label: "Learning now", value: started.length - secured },
		{ label: "Reviews due", value: due },
	];

	return (
		<div className="space-y-6">
			<ProgrammeReportView report={report} />
			<ProgrammeControls report={report} />

			<section aria-label="Progress summary" className="space-y-3">
				<div className="grid grid-cols-3 gap-3">
					{stats.map((s) => (
						<div key={s.label} className="stat">
							<p className="text-sm text-ink-mute">{s.label}</p>
							<p className="stat-value">
								{s.value}
								{s.of !== undefined && <span className="text-base text-ink-mute"> / {s.of}</span>}
							</p>
						</div>
					))}
				</div>
				{bySubject.length > 1 && (
					<ul className="grid grid-cols-2 gap-3" aria-label="Progress by subject">
						{bySubject.map((s) => (
							<li key={s.subject} className="stat" data-testid={`subject-progress-${s.subject}`}>
								<p className="text-sm text-ink-mute">{SUBJECTS[s.subject]}</p>
								<p className="font-semibold">
									{s.secured} / {s.total} secured
								</p>
								<p className="text-sm text-ink-soft">
									{s.due === 0 ? "No review due" : `${s.due} review${s.due > 1 ? "s" : ""} due`}
								</p>
							</li>
						))}
					</ul>
				)}
				<p className="text-ink-soft">
					{started.length === 0
						? `${student.displayName} has not done a mission yet. Start one from the Missions tab.`
						: `${student.displayName} has secured ${secured} of ${objectives.length} objectives${
								due > 0 ? ` and has ${due} review${due > 1 ? "s" : ""} to do` : ""
							}.`}
				</p>
			</section>

			{started.length > 0 && (
				<section aria-labelledby="working-title" className="space-y-3">
					<h2 id="working-title" className="h2">
						Working on
					</h2>
					{started.map((o) => (
						<ObjectiveCard key={o.code} objective={o} studentId={student.id} />
					))}
				</section>
			)}

			<LearningOutcomes outcomes={outcomes} title={title} />

			{waiting.length > 0 && (
				<section aria-labelledby="waiting-title" className="card space-y-3">
					<h2 id="waiting-title" className="h2">
						Not started yet
					</h2>
					<ul className="divide-y divide-line">
						{waiting.map((o) => (
							<li
								key={o.code}
								id={`evidence-${o.code}`}
								className="scroll-mt-4 py-2"
								data-testid={`evidence-${o.code}`}
							>
								<details className="text-sm">
									<summary className="flex cursor-pointer items-center justify-between gap-3">
										<span className="text-base">{o.title}</span>
										<span className="shrink-0 text-xs text-ink-mute">Already known?</span>
									</summary>
									<OverrideForm studentId={student.id} objectiveCode={o.code} hasOverride={!!o.override} />
								</details>
							</li>
						))}
					</ul>
				</section>
			)}

			{events.length > 0 && (
				<section className="card">
					<h2 className="h2 mb-3">Recent changes</h2>
					<ul className="space-y-1 text-sm">
						{events.slice(0, 5).map((e) => (
							<li key={e.id}>
								{formatDate(e.createdAt)} · {title(e.objectiveCode)}: now{" "}
								<strong>{STATUS_LABELS[e.toStatus as CompetencyStatus] ?? e.toStatus}</strong>
							</li>
						))}
					</ul>
				</section>
			)}
		</div>
	);
}

function ObjectiveCard({ objective: o, studentId }: { objective: Objective; studentId: string }) {
	return (
		<article id={`evidence-${o.code}`} className="card scroll-mt-4 space-y-3" data-testid={`evidence-${o.code}`}>
			<div className="flex items-start justify-between gap-3">
				<p className="font-display text-lg leading-snug">{o.title}</p>
				<StatusBadge status={o.status} />
			</div>
			<p className="text-ink-soft">{STATUS_HINT[o.status]}</p>
			{o.review && (
				<p className="text-sm text-ink-mute">
					{o.review.isDue ? "Review due now." : `Next review: ${formatDate(o.review.dueAt)}.`}
				</p>
			)}
			{o.override && (
				<p className="note-hint text-sm">
					You set this to {STATUS_LABELS[o.override.status]}: “{o.override.reason}”.
				</p>
			)}
			<details className="text-sm">
				<summary className="cursor-pointer font-medium text-ink-soft">Details</summary>
				<div className="mt-3 space-y-4">
					<p>{o.statement}</p>
					<dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
						{MODES.map(([m, label]) => (
							<div key={m} className="rounded-lg border border-line px-3 py-2">
								<dt className="text-xs text-ink-mute">{label}</dt>
								<dd className="font-display text-xl">
									{o.evidence[m].correct}
									<span className="text-sm text-ink-mute"> / {o.evidence[m].items} right</span>
								</dd>
							</div>
						))}
					</dl>
					<ObjectiveHistory history={o.history} code={o.code} />
					<p className="text-xs text-ink-mute">
						Curriculum: {o.source.publisher}, {o.source.title} ({o.source.reference}).{" "}
						<a className="link" href={o.source.url} target="_blank" rel="noreferrer">
							View source
						</a>
					</p>
					<OverrideForm studentId={studentId} objectiveCode={o.code} hasOverride={!!o.override} />
				</div>
			</details>
		</article>
	);
}

const CALIBRATION_LABEL = {
	matches: "about right",
	over: "felt surer than the results",
	under: "did better than they felt",
} as const;

const percent = (x: number) => `${Math.round(x * 100)}%`;

function LearningOutcomes({ outcomes, title }: { outcomes: Progress["outcomes"]; title: (code: string) => string }) {
	const { reviews, confidence } = outcomes;
	if (reviews.completed === 0 && confidence.checks.length === 0) return null;
	return (
		<section aria-labelledby="outcomes-title" className="card space-y-4" data-testid="outcomes">
			<h2 id="outcomes-title" className="h2">
				Does it stick?
			</h2>
			<div className="grid gap-3 sm:grid-cols-2">
				<div className="rounded-lg border border-line px-3 py-2" data-testid="outcomes-retention">
					<p className="text-xs text-ink-mute">Remembered at later reviews</p>
					{reviews.completed === 0 ? (
						<p className="text-sm text-ink-soft">No review done yet.</p>
					) : (
						<p className="font-display text-xl">
							{reviews.held}
							<span className="text-sm text-ink-mute"> of {reviews.completed} reviews passed</span>
						</p>
					)}
				</div>
				<div className="rounded-lg border border-line px-3 py-2" data-testid="outcomes-confidence">
					<p className="text-xs text-ink-mute">How sure they felt, compared with results</p>
					{confidence.checks.length === 0 ? (
						<p className="text-sm text-ink-soft">No check-in yet.</p>
					) : (
						<p className="font-display text-xl">
							{confidence.matches}
							<span className="text-sm text-ink-mute"> of {confidence.checks.length} matched</span>
						</p>
					)}
				</div>
			</div>
			{confidence.checks.length > 0 && (
				<details className="text-sm">
					<summary className="cursor-pointer font-medium text-ink-soft">See each check-in</summary>
					<ul className="mt-2 space-y-1 text-ink-soft" aria-label="Confidence check-ins">
						{confidence.checks.map((c) => (
							<li key={c.sessionId}>
								{formatDate(c.completedAt)} · {title(c.objectiveCode)}: felt {c.confidence} of 5, got{" "}
								{percent(c.accuracy)} right alone, <strong>{CALIBRATION_LABEL[c.calibration]}</strong>
							</li>
						))}
					</ul>
					<p className="mt-2 text-xs text-ink-mute">A review passes at 80% or more.</p>
				</details>
			)}
		</section>
	);
}

function ObjectiveHistory({ history, code }: { history: Objective["history"]; code: string }) {
	const max = Math.max(1, ...history.weeks.map((w) => w.answers));
	const active = history.weeks.some((w) => w.answers > 0) || history.changes.length > 0;
	if (!active) return null;
	return (
		<div className="space-y-3 " data-testid={`history-${code}`}>
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
							{formatDate(c.at)} · <strong>{STATUS_LABELS[c.toStatus as CompetencyStatus] ?? c.toStatus}</strong>
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
			className="mt-3 grid gap-2 sm:grid-cols-[auto_1fr_auto]"
			onSubmit={(e) => {
				e.preventDefault();
				void action.run(e.currentTarget);
			}}
		>
			<select name="status" className="input" aria-label="Set status" defaultValue="secure">
				{STATUSES.map((s) => (
					<option key={s} value={s}>
						{STATUS_LABELS[s]}
					</option>
				))}
				{hasOverride && <option value="clear">Back to automatic</option>}
			</select>
			<input name="reason" className="input" placeholder="Reason (required)" minLength={3} required />
			<button type="submit" className="btn-secondary" disabled={action.pending}>
				Set status
			</button>
			<div className="sm:col-span-3">
				<ErrorBox error={action.error} />
			</div>
		</form>
	);
}
