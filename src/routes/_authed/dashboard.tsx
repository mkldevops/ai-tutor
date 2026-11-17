import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ErrorBox, Field, useAction } from "#/components/form";
import { Nova } from "#/components/nova";
import { formatDate } from "#/components/status";
import { createStudentFn, getFamilyOverviewFn } from "#/server/functions";
import type { LearnerOverview } from "#/server/services/overview";

export const Route = createFileRoute("/_authed/dashboard")({
	loader: () => getFamilyOverviewFn(),
	component: Dashboard,
});

function Dashboard() {
	const students = Route.useLoaderData();
	const router = useRouter();
	const create = useAction(async (form: HTMLFormElement) => {
		const data = new FormData(form);
		await createStudentFn({
			data: {
				displayName: String(data.get("displayName")),
				yearGroup: Number(data.get("yearGroup")) as 3 | 5,
			},
		});
		form.reset();
		await router.invalidate();
	});

	return (
		<main className="page space-y-8">
			<header className="space-y-3">
				<p className="meta">Family dashboard · Key Stage 2 maths</p>
				<h1 className="h1">
					Your <i>learners</i>
				</h1>
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
							<p className="text-soft">Add one below and Nova will plan their first mission.</p>
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

			<section className="card max-w-md">
				<h2 className="h2 mb-1">Add a learner</h2>
				<p className="mb-4 text-sm text-ink-soft">
					Use a first name or nickname only. No full names or school details are needed.
				</p>
				<form
					className="space-y-4"
					onSubmit={(e) => {
						e.preventDefault();
						void create.run(e.currentTarget);
					}}
				>
					<Field label="Display name" name="displayName" required maxLength={40} />
					<label className="block">
						<span className="label">Year group</span>
						<select name="yearGroup" className="input" defaultValue="3">
							<option value="3">Year 3</option>
							<option value="5">Year 5</option>
						</select>
					</label>
					<ErrorBox error={create.error} />
					<button className="btn" type="submit" disabled={create.pending}>
						Add learner
					</button>
				</form>
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
