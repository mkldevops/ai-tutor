import { createRootRoute, HeadContent, Link, Scripts } from "@tanstack/react-router";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: "AI Tutor" },
		],
		links: [{ rel: "stylesheet", href: appCss }],
	}),
	shellComponent: RootDocument,
	errorComponent: ({ error }) => (
		<main className="page space-y-4">
			<h1 className="h1">Something went wrong</h1>
			<p role="alert" className="error">
				{error instanceof Error ? error.message : "Unexpected error"}
			</p>
			<Link to="/" className="link">
				Go home
			</Link>
		</main>
	),
	notFoundComponent: () => (
		<main className="page">
			<h1 className="h1">Page not found</h1>
			<Link to="/" className="link">
				Go home
			</Link>
		</main>
	),
});

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body>
				{children}
				<Scripts />
			</body>
		</html>
	);
}
