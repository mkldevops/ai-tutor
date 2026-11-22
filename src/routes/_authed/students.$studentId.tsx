import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { getProgressFn } from "#/server/functions";

export const Route = createFileRoute("/_authed/students/$studentId")({
	loader: ({ params }) => getProgressFn({ data: { studentId: params.studentId } }),
	component: StudentLayout,
});

const TABS = [
	{ to: "/students/$studentId", label: "Missions", exact: true, parent: false },
	{ to: "/students/$studentId/progress", label: "Progress", exact: false, parent: true },
	{ to: "/students/$studentId/outcomes", label: "Outcomes", exact: false, parent: true },
	{ to: "/students/$studentId/worksheets", label: "Worksheets", exact: false, parent: true },
	{ to: "/students/$studentId/settings", label: "Settings", exact: false, parent: true },
] as const;

function StudentLayout() {
	const { student } = Route.useLoaderData();
	const { me } = Route.useRouteContext();
	const tabs = TABS.filter((t) => me.parent.unlocked || !t.parent);
	return (
		<main className="page space-y-6">
			<header className="space-y-4">
				<Link to="/dashboard" className="link text-sm">
					← All learners
				</Link>
				<h1 className="h1" data-testid="student-name">
					{student.displayName} <i className="text-ink-mute">· Year {student.yearGroup}</i>
				</h1>
				<nav aria-label={`${student.displayName} sections`} className="tabs">
					{tabs.map((t) => (
						<Link
							key={t.to}
							to={t.to}
							params={{ studentId: student.id }}
							activeOptions={{ exact: t.exact }}
							className="tab"
						>
							{t.label}
						</Link>
					))}
				</nav>
			</header>
			<Outlet />
		</main>
	);
}
