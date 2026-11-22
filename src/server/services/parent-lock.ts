import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { z } from "zod";
import { PARENT_IDLE_MS, PARENT_LOCKED_MESSAGE, PIN_PATTERN } from "#/domain/parent-lock";
import { AuthError, type AuthProvider, type AuthUser } from "../auth/provider";
import { rateLimit } from "../rate-limit";
import type { DataStore, FamilyRecord } from "../store/types";
import { AppError } from "./errors";
import { type Actor, audit } from "./family";

export { PARENT_IDLE_MS };
export const PIN_ATTEMPTS = { limit: 8, windowMs: 15 * 60_000 } as const;

export const pinSchema = z.string().regex(PIN_PATTERN, "Use 4 to 8 digits");

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export async function hashPin(pin: string): Promise<string> {
	const salt = randomBytes(16);
	const hash = await scryptAsync(pin, salt, 32);
	return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
	const [scheme, salt, hash] = stored.split("$");
	if (scheme !== "scrypt" || !salt || !hash) return false;
	const expected = Buffer.from(hash, "base64url");
	const actual = await scryptAsync(pin, Buffer.from(salt, "base64url"), expected.length);
	return timingSafeEqual(actual, expected);
}

export type UnlockScope = { familyId: string; sessionSecret: string; pinSetAt: string };

function mac(key: Buffer, scope: UnlockScope, exp: number): string {
	const session = createHash("sha256").update(scope.sessionSecret).digest("hex");
	return createHmac("sha256", key)
		.update(`${scope.familyId}\n${session}\n${scope.pinSetAt}\n${exp}`)
		.digest("base64url");
}

export function signUnlock(key: Buffer, scope: UnlockScope, now: number): string {
	const exp = now + PARENT_IDLE_MS;
	return `${exp}.${mac(key, scope, exp)}`;
}

export function verifyUnlock(key: Buffer, scope: UnlockScope, token: string | undefined, now: number): boolean {
	if (!token) return false;
	const [rawExp, sig] = token.split(".");
	const exp = Number(rawExp);
	if (!Number.isSafeInteger(exp) || !sig || exp <= now || exp > now + PARENT_IDLE_MS) return false;
	const expected = Buffer.from(mac(key, scope, exp));
	const actual = Buffer.from(sig);
	return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function hasPin(family: Pick<FamilyRecord, "parentPinHash" | "parentPinSetAt"> | null): boolean {
	return !!family?.parentPinHash && !!family.parentPinSetAt;
}

export const parentLocked = () => new AppError("parent_locked", PARENT_LOCKED_MESSAGE);

export type ParentLockDeps = { store: DataStore; auth: AuthProvider; now?: () => Date };

export async function unlockParentArea(deps: ParentLockDeps, actor: Actor, pin: string): Promise<FamilyRecord | null> {
	await rateLimit(`parent-pin:${actor.familyId}`, PIN_ATTEMPTS.limit, PIN_ATTEMPTS.windowMs);
	const family = await deps.store.families.get(actor.familyId);
	if (!family || !hasPin(family)) return family;
	if (!(await verifyPin(pin, family.parentPinHash as string))) {
		await audit(deps.store, actor, "parent.unlock_failed", `families/${actor.familyId}`);
		throw new AppError("invalid", "Incorrect PIN.");
	}
	await audit(deps.store, actor, "parent.unlock", `families/${actor.familyId}`);
	return family;
}

export async function setParentPin(
	deps: ParentLockDeps,
	user: AuthUser,
	actor: Actor,
	input: { password: string; pin: string },
): Promise<FamilyRecord> {
	await rateLimit(`signin:${user.email.toLowerCase()}`, 10, 15 * 60_000);
	let secret: string;
	try {
		secret = (await deps.auth.signIn(user.email, input.password)).sessionSecret;
	} catch (e) {
		if (e instanceof AuthError && e.code === "invalid_credentials") {
			throw new AppError("invalid", "Incorrect account password.");
		}
		throw e;
	}
	await deps.auth.signOut(secret);
	const pin = pinSchema.parse(input.pin);
	const before = await deps.store.families.get(actor.familyId);
	const family = await deps.store.families.update(actor.familyId, {
		parentPinHash: await hashPin(pin),
		parentPinSetAt: (deps.now?.() ?? new Date()).toISOString(),
	});
	await audit(deps.store, actor, hasPin(before) ? "parent.pin_reset" : "parent.pin_set", `families/${actor.familyId}`);
	return family;
}
