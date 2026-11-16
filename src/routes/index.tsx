import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Nova } from "#/components/nova";
import { getMe } from "#/server/functions";

export const Route = createFileRoute("/")({
	beforeLoad: async () => {
		if (await getMe()) throw redirect({ to: "/dashboard" });
	},
	component: Home,
});

const FLIGHT_PLAN = [
	{ step: "Recall", text: "A quick warm-up finds what your child already knows." },
	{ step: "Explain", text: "Nova teaches the idea in short, clear steps." },
	{ step: "Practise", text: "Guided questions with hints. Mistakes here never count." },
	{ step: "Solo flight", text: "An independent check, then a review a few days later." },
];

function Home() {
	return (
		<div className="surface-space min-h-screen">
			<main className="page flex min-h-screen max-w-5xl flex-col justify-center gap-12 py-12">
				<p className="text-lg font-bold">
					ai tutor<span className="text-accent">.</span>
				</p>
				<div className="grid items-center gap-10 md:grid-cols-[1fr_auto]">
					<div className="space-y-6">
						<p className="meta">Key Stage 2 maths · National Curriculum in England</p>
						<h1 className="font-display text-5xl leading-[0.95] sm:text-7xl">
							Maths that <i className="text-accent">stays</i> learnt.
						</h1>
						<p className="max-w-xl text-lg text-soft">
							A private family tutor. Nova diagnoses, teaches, lets your child practise, checks them solo and calls them
							back before they forget.
						</p>
						<div className="flex flex-wrap gap-3">
							<Link to="/signup" className="btn">
								Create a family account
							</Link>
							<Link to="/login" className="btn-secondary">
								Sign in
							</Link>
						</div>
					</div>
					<Nova state="wave" size={300} priority className="mx-auto" />
				</div>
				<ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
					{FLIGHT_PLAN.map((p, i) => (
						<li key={p.step} className="card space-y-2">
							<p className="meta">
								{String(i + 1).padStart(2, "0")} · {p.step}
							</p>
							<p className="text-sm text-soft">{p.text}</p>
						</li>
					))}
				</ol>
			</main>
		</div>
	);
}
