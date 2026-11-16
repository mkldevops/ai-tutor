import { createRootRoute, HeadContent, Link, Scripts } from "@tanstack/react-router";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: "AI Tutor" },
		],
		links: [
			{ rel: "preconnect", href: "https://fonts.googleapis.com" },
			{ rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
			{
				rel: "stylesheet",
				href: "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500..800&family=Lexend:wght@400..700&family=JetBrains+Mono:wght@500&display=swap",
			},
			{ rel: "stylesheet", href: appCss },
		],
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
