import { createFileRoute, Link, Outlet, redirect } from "@tanstack/react-router";
import { UserMenu } from "#/components/user-menu";
import { getMe } from "#/server/functions";

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
	return (
		<div className="min-h-screen">
			<header className="surface-space border-b border-white/10 bg-space-800 bg-none print:hidden">
				<div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
					<Link to="/dashboard" className="text-lg font-bold text-star" aria-label="AI Tutor home">
						ai tutor<span className="text-accent">.</span>
					</Link>
					<UserMenu name={me.user.name} email={me.user.email} isKnowledgeAdmin={me.isKnowledgeAdmin} />
				</div>
			</header>
			<Outlet />
		</div>
	);
}
