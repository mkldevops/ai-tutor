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
			<header className="surface-space border-b border-white/10 bg-space-800 bg-none">
				<div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
					<Link to="/dashboard" className="text-lg font-bold text-star" aria-label="AI Tutor home">
						ai tutor<span className="text-accent">.</span>
					</Link>
					<div className="flex items-center gap-3 text-sm">
						<span className="hidden text-dust sm:inline">{me.user.name}</span>
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
