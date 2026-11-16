import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ErrorBox, Field, useAction } from "#/components/form";
import { Orbi } from "#/components/orbi";
import { createStudentFn, listStudentsFn } from "#/server/functions";

export const Route = createFileRoute("/_authed/dashboard")({
	loader: () => listStudentsFn(),
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
						<Orbi state="ready" size={120} className="shrink-0" />
						<div className="space-y-1">
							<p className="font-display text-2xl">No learners yet.</p>
							<p className="text-soft">Add one below and Orbi will plan their first mission.</p>
						</div>
					</div>
				) : (
					<ul className="grid gap-4 sm:grid-cols-2">
						{students.map((s) => (
							<li key={s.id} className="card flex items-center gap-4">
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
