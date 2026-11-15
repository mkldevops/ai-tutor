import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { getMe } from "#/server/functions";

export const Route = createFileRoute("/")({
	beforeLoad: async () => {
		if (await getMe()) throw redirect({ to: "/dashboard" });
	},
	component: Home,
});

function Home() {
	return (
		<main className="page flex min-h-screen flex-col justify-center gap-6">
			<h1 className="text-4xl font-bold tracking-tight">AI Tutor</h1>
			<p className="max-w-xl text-lg text-slate-600">
				A private family tutor for the National Curriculum in England (Key Stage 2). Diagnose, teach, practise, assess
				independently, and check again later.
			</p>
			<div className="flex gap-3">
				<Link to="/login" className="btn">
					Sign in
				</Link>
				<Link to="/signup" className="btn-secondary">
					Create a family account
				</Link>
			</div>
		</main>
	);
}
