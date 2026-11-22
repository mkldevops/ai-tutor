import { redirect, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { PARENT_IDLE_MS } from "#/domain/parent-lock";
import { lockParentFn } from "#/server/functions";

type GateArgs = {
	context: { me: { parent: { unlocked: boolean } } };
	location: { href: string };
};

export function requireParentArea({ context, location }: GateArgs) {
	if (!context.me.parent.unlocked) throw redirect({ to: "/unlock", search: { next: location.href } });
}

export function safeNext(next: unknown): string {
	return typeof next === "string" && /^\/(?![/\\])/.test(next) && !next.includes("\\") ? next : "/dashboard";
}

const ACTIVITY = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

export function useParentIdleLock(active: boolean) {
	const router = useRouter();
	useEffect(() => {
		if (!active) return;
		let timer: ReturnType<typeof setTimeout>;
		const lock = async () => {
			await lockParentFn();
			await router.invalidate();
		};
		const reset = () => {
			clearTimeout(timer);
			timer = setTimeout(() => void lock(), PARENT_IDLE_MS);
		};
		reset();
		for (const e of ACTIVITY) window.addEventListener(e, reset, { passive: true });
		return () => {
			clearTimeout(timer);
			for (const e of ACTIVITY) window.removeEventListener(e, reset);
		};
	}, [active, router]);
}
