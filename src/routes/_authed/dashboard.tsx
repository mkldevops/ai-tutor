import { createFileRoute, Link } from "@tanstack/react-router";
import { AddLearnerDialog } from "#/components/add-learner-dialog";
import { Nova } from "#/components/nova";
import { formatDate } from "#/components/status";
import { getFamilyOverviewFn } from "#/server/functions";
import type { LearnerOverview } from "#/server/services/overview";

export const Route = createFileRoute("/_authed/dashboard")({
	loader: () => getFamilyOverviewFn(),
	component: Dashboard,
});

function Dashboard() {
	const students = Route.useLoaderData();

	return (
		<main className="page space-y-8">
			<header className="space-y-3">
				<p className="meta">Family dashboard · Key Stage 2 maths</p>
				<div className="flex items-center justify-between gap-4">
					<h1 className="h1">
						Your <i>learners</i>
					</h1>
					<AddLearnerDialog />
				</div>
				<p className="max-w-xl text-ink-soft">
					Each learner has their own missions, progress and review dates. Open one to see what to practise next.
				</p>
			</header>

			<section aria-label="Learners">
				{students.length === 0 ? (
					<div className="panel-space surface-space flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
						<Nova state="empty" size={120} className="shrink-0" />
						<div className="space-y-1">
							<p className="font-display text-2xl">No learners yet.</p>
							<p className="text-soft">Tap + to add one and Nova will plan their first mission.</p>
						</div>
					</div>
				) : (
					<ul className="grid gap-4 sm:grid-cols-2">
						{students.map((s) => (
							<li key={s.id} className="card space-y-4" data-testid={`learner-${s.displayName}`}>
								<div className="flex items-center gap-4">
									<span
										aria-hidden="true"
										className="grid size-12 shrink-0 place-items-center rounded-full bg-space-800 font-display text-2xl text-star"
									>
										{s.displayName.slice(0, 1).toUpperCase()}
									</span>
									<div className="min-w-0 flex-1">
										<p className="truncate font-display text-2xl leading-tight">{s.displayName}</p>
										<p className="meta mt-1">Year {s.yearGroup}</p>
									</div>
									<Link
										to="/students/$studentId"
										params={{ studentId: s.id }}
										className="btn"
										aria-label={`Open ${s.displayName}`}
									>
										Open
									</Link>
								</div>
								<LearnerStats learner={s} />
							</li>
						))}
					</ul>
				)}
			</section>
		</main>
	);
}

function LearnerStats({ learner: s }: { learner: LearnerOverview }) {
	const pct = s.week.answers > 0 ? Math.round((s.week.correct / s.week.answers) * 100) : null;
	return (
		<div className="space-y-3 border-t border-line pt-3 text-sm">
			<dl className="grid grid-cols-3 gap-2">
				<div>
					<dt className="text-xs text-ink-mute">Secure</dt>
					<dd className="font-display text-xl" data-testid="overview-secure">
						{s.secure}
						<span className="text-sm text-ink-mute"> / {s.objectives}</span>
					</dd>
				</div>
				<div>
					<dt className="text-xs text-ink-mute">This week</dt>
					<dd className="font-display text-xl" data-testid="overview-week">
						{s.week.answers}
						<span className="text-sm text-ink-mute"> {s.week.answers === 1 ? "answer" : "answers"}</span>
					</dd>
				</div>
				<div>
					<dt className="text-xs text-ink-mute">Correct</dt>
					<dd className="font-display text-xl">{pct === null ? "—" : `${pct}%`}</dd>
				</div>
			</dl>
			<p className="flex flex-wrap items-center gap-2 text-ink-soft">
				{s.reviewsDue > 0 ? (
					<span className="badge" data-tone="watch" data-testid="overview-review">
						{s.reviewsDue} {s.reviewsDue === 1 ? "review" : "reviews"} due
					</span>
				) : s.nextReviewAt ? (
					<span className="badge" data-testid="overview-review">
						Next review {formatDate(s.nextReviewAt)}
					</span>
				) : null}
				<span className="meta">{s.lastActiveAt ? `Last active ${formatDate(s.lastActiveAt)}` : "No missions yet"}</span>
			</p>
		</div>
	);
}
