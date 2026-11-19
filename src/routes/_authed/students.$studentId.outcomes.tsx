import { createFileRoute } from "@tanstack/react-router";
import { SUBJECTS } from "#/components/lesson-visual";
import { formatDate, STATUS_LABELS, StatusBadge } from "#/components/status";
import { MIN_RATE_SAMPLE, type Rate } from "#/learning-engine/longitudinal";
import { getOutcomesFn } from "#/server/functions";
import type { ObjectiveOutcome, StudentOutcomes } from "#/server/services/longitudinal";

export const Route = createFileRoute("/_authed/students/$studentId/outcomes")({
	loader: ({ params }) => getOutcomesFn({ data: { studentId: params.studentId } }),
	component: OutcomesTab,
});

const ORDINALS = ["1st", "2nd", "3rd"];
const ordinal = (n: number) => ORDINALS[n - 1] ?? `${n}th`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function RateValue({ value, empty }: { value: Rate; empty: string }) {
	if (value.total === 0) return <p className="text-sm text-ink-soft">{empty}</p>;
	return (
		<p className="font-display text-xl">
			{value.passed}
			<span className="text-sm text-ink-mute"> of {value.total}</span>
			{value.rate !== null && <span className="text-sm text-ink-mute"> · {Math.round(value.rate * 100)}%</span>}
		</p>
	);
}

function OutcomesTab() {
	const o = Route.useLoaderData();
	const name = o.student.displayName;
	if (o.objectives.length === 0) {
		return (
			<section className="card" data-testid="outcomes-empty">
				<p className="text-ink-soft">{name} has no evidence yet. Outcomes appear after the first mission.</p>
			</section>
		);
	}
	return (
		<div className="space-y-6">
			<section aria-labelledby="lasting-title" className="card space-y-4" data-testid="outcomes-summary">
				<h2 id="lasting-title" className="h2">
					Does learning last?
				</h2>
				<div className="grid gap-3 sm:grid-cols-2">
					<div className="rounded-lg border border-line px-3 py-2" data-testid="outcomes-pass-rate">
						<p className="text-xs text-ink-mute">Spaced reviews passed</p>
						<RateValue value={o.passRate} empty="No spaced review yet." />
					</div>
					<div className="rounded-lg border border-line px-3 py-2" data-testid="outcomes-regressions">
						<p className="text-xs text-ink-mute">Slipped after being secure</p>
						<p className="font-display text-xl">{plural(o.regressions, "time")}</p>
					</div>
					<div className="rounded-lg border border-line px-3 py-2" data-testid="outcomes-overdue">
						<p className="text-xs text-ink-mute">Reviews overdue</p>
						<p className="font-display text-xl">{o.overdueReviews}</p>
					</div>
					<div className="rounded-lg border border-line px-3 py-2" data-testid="outcomes-secure-now">
						<p className="text-xs text-ink-mute">Secure or mastered now, from answers</p>
						<p className="font-display text-xl">
							{o.securedNow}
							<span className="text-sm text-ink-mute"> of {o.objectives.length} started</span>
						</p>
					</div>
				</div>
				<div className="space-y-2">
					<p className="text-sm font-medium text-ink-soft">Still remembered at each spaced review</p>
					<ol className="grid grid-cols-3 gap-3" aria-label="Retention by review">
						{o.retention.map((r, i) => (
							<li
								key={ORDINALS[i]}
								className="rounded-lg border border-line px-3 py-2"
								data-testid={`outcomes-retention-${i + 1}`}
							>
								<p className="text-xs text-ink-mute">{ordinal(i + 1)} review</p>
								<RateValue value={r} empty="None yet" />
							</li>
						))}
					</ol>
				</div>
				<Method outcomes={o} />
			</section>

			<section aria-labelledby="by-objective-title" className="space-y-3">
				<h2 id="by-objective-title" className="h2">
					By objective
				</h2>
				{o.objectives.map((obj) => (
					<ObjectiveOutcomeCard key={obj.objectiveCode} objective={obj} />
				))}
			</section>
		</div>
	);
}

function Method({ outcomes: o }: { outcomes: StudentOutcomes }) {
	return (
		<details className="text-sm">
			<summary className="cursor-pointer font-medium text-ink-soft">How these are counted</summary>
			<ul className="mt-2 list-disc space-y-1 pl-5 text-ink-soft">
				<li>Counted from the answers {o.student.displayName} gave. Status changes you made by hand are not used.</li>
				<li>
					A spaced review counts once an objective has been secure for at least {o.policy.reviewMinDelayDays} days. It
					passes with {o.policy.reviewMinItems} or more questions, {Math.round(o.policy.reviewMinAccuracy * 100)}% right
					and no hints.
				</li>
				<li>A percentage is shown only from {MIN_RATE_SAMPLE} reviews; with fewer, only the counts are shown.</li>
				<li>Numbering restarts when an objective slips and is secured again.</li>
				<li>A review is overdue when it was due more than a day ago.</li>
				{o.unscoredReviews > 0 && (
					<li data-testid="outcomes-unscored">
						{plural(o.unscoredReviews, "review")} done too early or before the objective was secure, so not counted.
					</li>
				)}
			</ul>
		</details>
	);
}

function ObjectiveOutcomeCard({ objective: o }: { objective: ObjectiveOutcome }) {
	return (
		<article className="card space-y-3" data-testid={`outcome-${o.objectiveCode}`}>
			<div className="flex items-start justify-between gap-3">
				<div>
					<p className="meta">{SUBJECTS[o.subject as keyof typeof SUBJECTS] ?? o.subject}</p>
					<p className="font-display text-lg leading-snug">{o.title}</p>
				</div>
				<StatusBadge status={o.status} />
			</div>
			<p className="text-sm text-ink-soft" data-testid="outcome-since">
				{o.masteredAt
					? `Mastered since ${formatDate(o.masteredAt)}, secure for ${plural(o.daysSinceSecured ?? 0, "day")}.`
					: o.securedAt
						? `Secure for ${plural(o.daysSinceSecured ?? 0, "day")}, not yet confirmed by a spaced review.`
						: `Not secure from answers yet (${STATUS_LABELS[o.status]}).`}
			</p>
			{o.reviews.length > 0 ? (
				<ol className="space-y-1 text-sm" aria-label="Spaced reviews" data-testid="outcome-reviews">
					{o.reviews.map((r) => (
						<li key={r.sessionId}>
							{formatDate(r.completedAt)} · {ordinal(r.ordinal)} review, {r.daysAfterSecured} days after securing:{" "}
							{r.correct} of {r.items} right, <strong>{r.held ? "held" : "slipped"}</strong>
						</li>
					))}
				</ol>
			) : (
				<p className="text-sm text-ink-mute">No spaced review yet.</p>
			)}
			<p className="flex flex-wrap gap-2 text-sm">
				{o.regressions > 0 && (
					<span className="badge" data-tone="watch" data-testid="outcome-regressions">
						Slipped {plural(o.regressions, "time")}
						{o.lastRegressionAt ? `, last ${formatDate(o.lastRegressionAt)}` : ""}
					</span>
				)}
				{o.nextReview &&
					(o.nextReview.overdue ? (
						<span className="badge" data-tone="watch" data-testid="outcome-overdue">
							Review overdue by {plural(o.nextReview.daysOverdue, "day")}
						</span>
					) : (
						<span className="badge" data-testid="outcome-next-review">
							Next review {formatDate(o.nextReview.dueAt)}
						</span>
					))}
			</p>
		</article>
	);
}
