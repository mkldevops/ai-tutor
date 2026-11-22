import { createFileRoute, Link, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { ErrorBox, Field, useAction } from "#/components/form";
import { safeNext } from "#/components/parent-gate";
import { PIN_FIELD, SetPinForm } from "#/components/parent-pin-form";
import { listStudentsFn, unlockParentFn } from "#/server/functions";

export const Route = createFileRoute("/_authed/unlock")({
	validateSearch: z.object({ next: z.string().max(500).optional() }),
	beforeLoad: ({ context, search }) => {
		if (context.me.parent.unlocked) throw redirect({ href: safeNext(search.next) });
	},
	loader: ({ context }) => (context.me.familyId ? listStudentsFn() : []),
	component: Unlock,
});

function Unlock() {
	const students = Route.useLoaderData();
	const { next } = Route.useSearch();
	const router = useRouter();
	const [resetting, setResetting] = useState(false);
	const goNext = async () => {
		await router.invalidate();
		await router.navigate({ href: safeNext(next) });
	};
	const unlock = useAction(async (form: FormData) => {
		await unlockParentFn({ data: { pin: String(form.get("pin")) } });
		await goNext();
	});

	return (
		<main className="page max-w-md space-y-6">
			<header className="space-y-3">
				<p className="meta">Parent area</p>
				<h1 className="h1">
					Locked <i>for grown-ups</i>
				</h1>
				<p className="text-ink-soft">Reports, settings and overrides need the parent PIN.</p>
			</header>

			{students.length > 0 && (
				<section aria-labelledby="learners-heading" className="card space-y-3">
					<h2 id="learners-heading" className="font-display text-2xl">
						Learners
					</h2>
					<ul className="divide-y divide-line">
						{students.map((s) => (
							<li key={s.id} className="flex items-center justify-between gap-3 py-2">
								<span className="truncate">{s.displayName}</span>
								<Link to="/students/$studentId" params={{ studentId: s.id }} className="btn shrink-0">
									Go to missions
								</Link>
							</li>
						))}
					</ul>
				</section>
			)}

			<section aria-labelledby="pin-heading" className="card space-y-3">
				<h2 id="pin-heading" className="font-display text-2xl">
					{resetting ? "Reset the PIN" : "Parent PIN"}
				</h2>
				{resetting ? (
					<>
						<p className="text-sm text-ink-soft">Enter your account password and choose a new PIN.</p>
						<SetPinForm submitLabel="Reset PIN" onDone={goNext} />
					</>
				) : (
					<form
						className="space-y-3"
						onSubmit={(e) => {
							e.preventDefault();
							void unlock.run(new FormData(e.currentTarget));
						}}
					>
						<Field label="PIN" name="pin" type="password" {...PIN_FIELD} autoFocus required />
						<ErrorBox error={unlock.error} />
						<button className="btn w-full" type="submit" disabled={unlock.pending}>
							{unlock.pending ? "Checking…" : "Unlock"}
						</button>
					</form>
				)}
				<button type="button" className="link text-sm" onClick={() => setResetting((v) => !v)}>
					{resetting ? "Back to PIN" : "Forgot the PIN?"}
				</button>
			</section>
		</main>
	);
}
