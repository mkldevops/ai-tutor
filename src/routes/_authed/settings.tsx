import { createFileRoute, Link } from "@tanstack/react-router";
import { listStudentsFn } from "#/server/functions";

export const Route = createFileRoute("/_authed/settings")({
	loader: () => listStudentsFn(),
	component: AccountSettings,
});

function AccountSettings() {
	const { me } = Route.useRouteContext();
	const students = Route.useLoaderData();
	return (
		<main className="page space-y-8">
			<header className="space-y-3">
				<p className="meta">Account</p>
				<h1 className="h1">Settings</h1>
			</header>

			<section aria-labelledby="profile-heading" className="card space-y-3">
				<h2 id="profile-heading" className="font-display text-2xl">
					Profile
				</h2>
				<dl className="grid gap-2 text-sm sm:grid-cols-[8rem_1fr]">
					<dt className="text-ink-mute">Name</dt>
					<dd>{me.user.name}</dd>
					<dt className="text-ink-mute">Email</dt>
					<dd className="break-all">{me.user.email}</dd>
				</dl>
			</section>

			<section aria-labelledby="learners-heading" className="card space-y-3">
				<h2 id="learners-heading" className="font-display text-2xl">
					Learner settings
				</h2>
				<p className="text-sm text-ink-soft">Voice, data export and deletion are set per learner.</p>
				{students.length === 0 ? (
					<p className="text-sm text-ink-mute">
						No learners yet.{" "}
						<Link to="/dashboard" className="link">
							Add one from the dashboard
						</Link>
						.
					</p>
				) : (
					<ul className="divide-y divide-line">
						{students.map((s) => (
							<li key={s.id} className="flex items-center justify-between gap-3 py-2">
								<span className="truncate">
									{s.displayName} <span className="meta">· Year {s.yearGroup}</span>
								</span>
								<Link to="/students/$studentId/settings" params={{ studentId: s.id }} className="link shrink-0">
									Open settings
								</Link>
							</li>
						))}
					</ul>
				)}
			</section>
		</main>
	);
}
