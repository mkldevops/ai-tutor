import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useId, useRef, useState } from "react";
import { signOut } from "#/server/functions";

type Props = { name: string; email: string; isKnowledgeAdmin: boolean };

const itemClass = "block w-full px-4 py-2 text-left text-sm text-ink hover:bg-brand-soft focus-visible:bg-brand-soft";

export function UserMenu({ name, email, isKnowledgeAdmin }: Props) {
	const [open, setOpen] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const menuId = useId();
	const router = useRouter();
	const pathname = useRouterState({ select: (s) => s.location.pathname });

	const [lastPath, setLastPath] = useState(pathname);
	if (pathname !== lastPath) {
		setLastPath(pathname);
		setOpen(false);
	}

	useEffect(() => {
		if (!open) return;
		const onPointer = (e: PointerEvent) => {
			if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				setOpen(false);
				buttonRef.current?.focus();
			}
		};
		document.addEventListener("pointerdown", onPointer);
		document.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("pointerdown", onPointer);
			document.removeEventListener("keydown", onKey);
		};
	}, [open]);

	return (
		<div ref={rootRef} className="relative">
			<button
				ref={buttonRef}
				type="button"
				aria-label="Account menu"
				aria-haspopup="menu"
				aria-expanded={open}
				aria-controls={menuId}
				onClick={() => setOpen((v) => !v)}
				className="grid size-9 place-items-center rounded-full border border-white/20 bg-space-700 font-display text-lg text-star hover:border-accent focus-visible:border-accent"
			>
				{name.slice(0, 1).toUpperCase() || (
					<svg
						aria-hidden="true"
						viewBox="0 0 24 24"
						className="size-5"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
					>
						<circle cx="12" cy="8" r="4" />
						<path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
					</svg>
				)}
			</button>
			{open ? (
				<div
					id={menuId}
					role="menu"
					aria-label="Account"
					className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-lg border border-line bg-paper py-1 shadow-lg"
				>
					<div className="border-b border-line px-4 py-2">
						<p className="truncate text-sm font-semibold text-ink" data-testid="user-menu-name">
							{name}
						</p>
						<p className="truncate text-xs text-ink-mute">{email}</p>
					</div>
					<Link to="/dashboard" role="menuitem" className={itemClass}>
						Dashboard
					</Link>
					<Link to="/settings" role="menuitem" className={itemClass}>
						Settings
					</Link>
					{isKnowledgeAdmin ? (
						<Link to="/knowledge" role="menuitem" className={itemClass}>
							Knowledge
						</Link>
					) : null}
					<button
						type="button"
						role="menuitem"
						className={`${itemClass} border-t border-line`}
						onClick={async () => {
							await signOut();
							await router.invalidate();
							await router.navigate({ to: "/login" });
						}}
					>
						Sign out
					</button>
				</div>
			) : null}
		</div>
	);
}
