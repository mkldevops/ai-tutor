import "@tanstack/react-start/server-only";
import { deleteCookie, getCookie, getRequestHeader, getRequestIP, setCookie } from "@tanstack/react-start/server";
import type { AuthUser } from "./auth/provider";
import { getServerContext } from "./context";
import { clientIp, rateLimit } from "./rate-limit";
import { AppError } from "./services/errors";
import { type Actor, resolveActor } from "./services/family";

export const SESSION_COOKIE = "ait_session";

export function clientKey(): string {
	return clientIp(getRequestHeader("x-forwarded-for"), getRequestIP());
}

export function setSessionCookie(secret: string) {
	const { config } = getServerContext();
	setCookie(SESSION_COOKIE, secret, {
		httpOnly: true,
		sameSite: "lax",
		secure: config.SESSION_COOKIE_SECURE ?? config.NODE_ENV === "production",
		path: "/",
		maxAge: 60 * 60 * 24 * 14,
	});
}

export function clearSessionCookie() {
	deleteCookie(SESSION_COOKIE, { path: "/" });
}

export async function currentUser(): Promise<AuthUser | null> {
	const secret = getCookie(SESSION_COOKIE);
	if (!secret) return null;
	return getServerContext().auth.getUser(secret);
}

export async function requireActor(): Promise<{ user: AuthUser; actor: Actor }> {
	const user = await currentUser();
	if (!user) throw new AppError("unauthenticated", "Please sign in.");
	await rateLimit(`user:${user.id}`, 240, 60_000);
	const actor = await resolveActor(getServerContext().store, user.id);
	if (!actor) throw new AppError("forbidden", "No family is linked to this account.");
	return { user, actor };
}

export function isKnowledgeAdmin(user: AuthUser): boolean {
	return getServerContext().config.KNOWLEDGE_ADMIN_EMAILS.includes(user.email.toLowerCase());
}

export async function requireKnowledgeAdmin(): Promise<AuthUser> {
	const user = await currentUser();
	if (!user) throw new AppError("unauthenticated", "Please sign in.");
	await rateLimit(`user:${user.id}`, 240, 60_000);
	if (!isKnowledgeAdmin(user)) throw new AppError("not_found", "Page not found");
	return user;
}
