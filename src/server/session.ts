import "@tanstack/react-start/server-only";
import { randomBytes } from "node:crypto";
import { deleteCookie, getCookie, getRequestHeader, getRequestIP, setCookie } from "@tanstack/react-start/server";
import type { AuthUser } from "./auth/provider";
import { getServerContext } from "./context";
import { clientIp, rateLimit } from "./rate-limit";
import { AppError } from "./services/errors";
import { type Actor, resolveActor } from "./services/family";
import {
	hasPin,
	PARENT_IDLE_MS,
	parentLocked,
	signUnlock,
	type UnlockScope,
	verifyUnlock,
} from "./services/parent-lock";
import type { FamilyRecord } from "./store/types";

export const SESSION_COOKIE = "ait_session";
export const PARENT_COOKIE = "ait_parent";

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
	deleteCookie(PARENT_COOKIE, { path: "/" });
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

const LOCK_KEY = Symbol.for("ai-tutor.parent-lock-key");
type KeyHolder = { [LOCK_KEY]?: Buffer };

function parentLockKey(): Buffer {
	const secret = getServerContext().config.PARENT_LOCK_SECRET;
	if (secret) return Buffer.from(secret);
	const holder = globalThis as KeyHolder;
	holder[LOCK_KEY] ??= randomBytes(32);
	return holder[LOCK_KEY];
}

function unlockScope(family: FamilyRecord): UnlockScope | null {
	const sessionSecret = getCookie(SESSION_COOKIE);
	if (!sessionSecret || !family.parentPinSetAt) return null;
	return { familyId: family.id, sessionSecret, pinSetAt: family.parentPinSetAt };
}

export type ParentState = { pinSet: boolean; unlocked: boolean };

export async function parentState(
	actor: Actor,
	now = Date.now(),
): Promise<ParentState & { family: FamilyRecord | null }> {
	const family = await getServerContext().store.families.get(actor.familyId);
	if (!family || !hasPin(family)) return { family, pinSet: false, unlocked: true };
	const scope = unlockScope(family);
	const unlocked = !!scope && verifyUnlock(parentLockKey(), scope, getCookie(PARENT_COOKIE), now);
	return { family, pinSet: true, unlocked };
}

export function grantParentUnlock(family: FamilyRecord, now = Date.now()) {
	const scope = unlockScope(family);
	if (!scope) return;
	const { config } = getServerContext();
	setCookie(PARENT_COOKIE, signUnlock(parentLockKey(), scope, now), {
		httpOnly: true,
		sameSite: "strict",
		secure: config.SESSION_COOKIE_SECURE ?? config.NODE_ENV === "production",
		path: "/",
		maxAge: PARENT_IDLE_MS / 1000,
	});
}

export function clearParentUnlock() {
	deleteCookie(PARENT_COOKIE, { path: "/" });
}

export async function assertParentUnlocked(actor: Actor) {
	const state = await parentState(actor);
	if (!state.unlocked) throw parentLocked();
	if (state.pinSet && state.family) grantParentUnlock(state.family);
}

export async function requireParent(): Promise<{ user: AuthUser; actor: Actor }> {
	const res = await requireActor();
	await assertParentUnlocked(res.actor);
	return res;
}
