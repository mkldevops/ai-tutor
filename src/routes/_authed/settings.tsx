import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { ErrorBox, useAction } from "#/components/form";
import { requireParentArea } from "#/components/parent-gate";
import { SetPinForm } from "#/components/parent-pin-form";
import { deleteAccountFn, listStudentsFn, lockParentFn } from "#/server/functions";

export const Route = createFileRoute("/_authed/settings")({
	beforeLoad: requireParentArea,
	loader: ({ context }) => (context.me.familyId ? listStudentsFn() : []),
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

			{me.familyId ? <ParentPin pinSet={me.parent.pinSet} /> : null}

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

			<DeleteAccount email={me.user.email} canDelete={me.role === "owner" || me.familyId === null} />
		</main>
	);
}

function ParentPin({ pinSet }: { pinSet: boolean }) {
	const router = useRouter();
	const lock = useAction(async () => {
		await lockParentFn();
		await router.invalidate();
	});
	return (
		<section id="parent-pin" aria-labelledby="parent-pin-heading" className="card space-y-3">
			<h2 id="parent-pin-heading" className="font-display text-2xl">
				Parent PIN
			</h2>
			<p className="text-sm text-ink-soft">
				{pinSet
					? "The PIN guards reports, settings and overrides. The area locks itself after 10 minutes without activity."
					: "Without a PIN, anyone on this device can open reports, settings and overrides. Learners keep access to their missions."}
			</p>
			<SetPinForm submitLabel={pinSet ? "Change PIN" : "Set PIN"} />
			{pinSet ? (
				<button type="button" className="btn" disabled={lock.pending} onClick={() => void lock.run()}>
					Lock now
				</button>
			) : null}
		</section>
	);
}

function DeleteAccount({ email, canDelete }: { email: string; canDelete: boolean }) {
	const router = useRouter();
	const [confirmEmail, setConfirmEmail] = useState("");
	const remove = useAction(async () => {
		await deleteAccountFn({ data: { confirmEmail } });
		await router.invalidate();
		await router.navigate({ to: "/" });
	});
	const matches = confirmEmail.trim().toLowerCase() === email.toLowerCase();
	return (
		<section aria-labelledby="delete-account-heading" className="card space-y-3 border-focus/40">
			<h2 id="delete-account-heading" className="font-display text-2xl text-[#b8432a]">
				Delete family and account
			</h2>
			{canDelete ? (
				<>
					<p className="text-sm text-ink-soft">This permanently deletes:</p>
					<ul className="list-disc space-y-1 pl-5 text-sm text-ink-soft">
						<li>every learner in your family, with their lessons, answers, chat messages and progress</li>
						<li>their review schedules and worksheet checks</li>
						<li>your family and your parent account (you are signed out and cannot sign in again)</li>
					</ul>
					<p className="text-sm text-ink-soft">
						It cannot be undone. Export each learner's data first if you want a copy. Type your account email{" "}
						<strong className="break-all">{email}</strong> to confirm.
					</p>
					<div className="flex flex-wrap gap-2">
						<input
							className="input max-w-xs"
							aria-label="Confirm account email"
							autoComplete="off"
							value={confirmEmail}
							onChange={(e) => setConfirmEmail(e.target.value)}
						/>
						<button
							type="button"
							className="btn-danger"
							disabled={!matches || remove.pending}
							onClick={() => void remove.run()}
						>
							Delete everything
						</button>
					</div>
					<ErrorBox error={remove.error} />
				</>
			) : (
				<p className="text-sm text-ink-soft">Only the family owner can delete the family and its learners.</p>
			)}
		</section>
	);
}
