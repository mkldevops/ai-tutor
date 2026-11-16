import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ErrorBox, Field, useAction } from "#/components/form";
import { signIn } from "#/server/functions";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
	const router = useRouter();
	const action = useAction(async (form: FormData) => {
		await signIn({ data: { email: String(form.get("email")), password: String(form.get("password")) } });
		await router.invalidate();
		await router.navigate({ to: "/dashboard" });
	});
	return (
		<main className="page max-w-md">
			<p className="meta mb-2">Parents</p>
			<h1 className="h1 mb-6">
				Welcome <i>back</i>
			</h1>
			<form
				className="card space-y-4"
				onSubmit={(e) => {
					e.preventDefault();
					void action.run(new FormData(e.currentTarget));
				}}
			>
				<Field label="Email" name="email" type="email" autoComplete="email" required />
				<Field label="Password" name="password" type="password" autoComplete="current-password" required />
				<ErrorBox error={action.error} />
				<button className="btn w-full" type="submit" disabled={action.pending}>
					{action.pending ? "Signing in…" : "Sign in"}
				</button>
			</form>
			<p className="mt-4 text-sm">
				No account?{" "}
				<Link to="/signup" className="link">
					Create one
				</Link>
			</p>
		</main>
	);
}
