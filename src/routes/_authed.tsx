import { createFileRoute, Link, Outlet, redirect, useRouter } from "@tanstack/react-router";
import { getMe, signOut } from "#/server/functions";

export const Route = createFileRoute("/_authed")({
	beforeLoad: async () => {
		const me = await getMe();
		if (!me) throw redirect({ to: "/login" });
		return { me };
	},
	component: AuthedLayout,
});

function AuthedLayout() {
	const { me } = Route.useRouteContext();
	const router = useRouter();
	return (
		<div className="min-h-screen">
			<header className="border-b border-slate-200 bg-white">
				<div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
					<Link to="/dashboard" className="font-bold text-brand">
						AI Tutor
					</Link>
					<div className="flex items-center gap-3 text-sm">
						<span className="hidden text-slate-600 sm:inline">{me.user.name}</span>
						<button
							type="button"
							className="btn-secondary py-1"
							onClick={async () => {
								await signOut();
								await router.invalidate();
								await router.navigate({ to: "/login" });
							}}
						>
							Sign out
						</button>
					</div>
				</div>
			</header>
			<Outlet />
		</div>
	);
}
