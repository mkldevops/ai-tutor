import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ErrorBox, Field, useAction } from "#/components/form";
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
			<section>
				<h1 className="h1 mb-4">Your learners</h1>
				{students.length === 0 ? (
					<p className="text-slate-600">No learners yet. Add one below.</p>
				) : (
					<ul className="grid gap-4 sm:grid-cols-2">
						{students.map((s) => (
							<li key={s.id} className="card flex items-center justify-between">
								<div>
									<p className="text-lg font-semibold">{s.displayName}</p>
									<p className="text-sm text-slate-600">Year {s.yearGroup}</p>
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
				<p className="mb-4 text-sm text-slate-600">
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
