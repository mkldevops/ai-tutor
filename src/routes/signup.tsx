import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ErrorBox, Field, useAction } from "#/components/form";
import { signUp } from "#/server/functions";

export const Route = createFileRoute("/signup")({ component: Signup });

function Signup() {
	const router = useRouter();
	const action = useAction(async (form: FormData) => {
		await signUp({
			data: {
				name: String(form.get("name")),
				familyName: String(form.get("familyName")),
				email: String(form.get("email")),
				password: String(form.get("password")),
			},
		});
		await router.invalidate();
		await router.navigate({ to: "/dashboard" });
	});
	return (
		<main className="page max-w-md">
			<h1 className="h1 mb-6">Create a family account</h1>
			<form
				className="card space-y-4"
				onSubmit={(e) => {
					e.preventDefault();
					void action.run(new FormData(e.currentTarget));
				}}
			>
				<Field label="Your name" name="name" autoComplete="given-name" required maxLength={60} />
				<Field label="Family name (shown on your dashboard)" name="familyName" required maxLength={60} />
				<Field label="Email" name="email" type="email" autoComplete="email" required />
				<Field
					label="Password (10+ characters)"
					name="password"
					type="password"
					autoComplete="new-password"
					minLength={10}
					required
				/>
				<ErrorBox error={action.error} />
				<button className="btn w-full" type="submit" disabled={action.pending}>
					{action.pending ? "Creating…" : "Create account"}
				</button>
			</form>
			<p className="mt-4 text-sm">
				Already registered?{" "}
				<Link to="/login" className="link">
					Sign in
				</Link>
			</p>
		</main>
	);
}
