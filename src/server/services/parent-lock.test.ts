import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { type AuthProvider, type AuthUser, createMemoryAuth } from "../auth/provider";
import { resetRateLimits } from "../rate-limit";
import { createMemoryStore } from "../store/memory-store";
import type { DataStore } from "../store/types";
import { AppError } from "./errors";
import { type Actor, createFamilyForUser } from "./family";
import {
	hashPin,
	hasPin,
	PARENT_IDLE_MS,
	PIN_ATTEMPTS,
	setParentPin,
	signUnlock,
	unlockParentArea,
	verifyPin,
	verifyUnlock,
} from "./parent-lock";

const PASSWORD = "correct horse battery";

describe("PIN hashing", () => {
	it("stores a salted hash that verifies only the right PIN", async () => {
		const a = await hashPin("4826");
		const b = await hashPin("4826");
		expect(a).not.toContain("4826");
		expect(a).not.toBe(b);
		expect(await verifyPin("4826", a)).toBe(true);
		expect(await verifyPin("4827", a)).toBe(false);
		expect(await verifyPin("4826", "garbage")).toBe(false);
	});
});

describe("unlock flag", () => {
	const key = randomBytes(32);
	const scope = { familyId: "fam1", sessionSecret: "secret-a", pinSetAt: "2026-11-22T10:00:00.000Z" };
	const now = 1_800_000_000_000;

	it("is valid for the same family, session and PIN until it expires", () => {
		const token = signUnlock(key, scope, now);
		expect(verifyUnlock(key, scope, token, now + PARENT_IDLE_MS - 1)).toBe(true);
		expect(verifyUnlock(key, scope, token, now + PARENT_IDLE_MS)).toBe(false);
	});

	it("is rejected after sign-out, a PIN reset, for another family or with another key", () => {
		const token = signUnlock(key, scope, now);
		expect(verifyUnlock(key, { ...scope, sessionSecret: "secret-b" }, token, now)).toBe(false);
		expect(verifyUnlock(key, { ...scope, pinSetAt: "2026-11-22T11:00:00.000Z" }, token, now)).toBe(false);
		expect(verifyUnlock(key, { ...scope, familyId: "fam2" }, token, now)).toBe(false);
		expect(verifyUnlock(randomBytes(32), scope, token, now)).toBe(false);
	});

	it("rejects a forged or stretched expiry", () => {
		const [, sig] = signUnlock(key, scope, now).split(".");
		expect(verifyUnlock(key, scope, `${now + 10 * PARENT_IDLE_MS}.${sig}`, now)).toBe(false);
		expect(verifyUnlock(key, scope, undefined, now)).toBe(false);
		expect(verifyUnlock(key, scope, "nonsense", now)).toBe(false);
	});
});

describe("parent PIN service", () => {
	let store: DataStore;
	let auth: AuthProvider;
	let user: AuthUser;
	let actor: Actor;

	beforeEach(async () => {
		resetRateLimits();
		store = createMemoryStore();
		auth = createMemoryAuth();
		user = (await auth.signUp("parent@example.test", PASSWORD, "Parent")).user;
		actor = await createFamilyForUser(store, user.id, "Family");
	});

	it("leaves the area open until a PIN is set", async () => {
		expect(hasPin(await store.families.get(actor.familyId))).toBe(false);
		expect(await unlockParentArea({ store, auth }, actor, "0000")).not.toBeNull();
	});

	it("needs the account password to set or reset the PIN", async () => {
		await expect(
			setParentPin({ store, auth }, user, actor, { password: "wrong password", pin: "4826" }),
		).rejects.toThrow("Incorrect account password.");
		expect(hasPin(await store.families.get(actor.familyId))).toBe(false);

		const first = await setParentPin({ store, auth }, user, actor, { password: PASSWORD, pin: "4826" });
		expect(hasPin(first)).toBe(true);
		const reset = await setParentPin({ store, auth }, user, actor, { password: PASSWORD, pin: "1357" });
		expect(reset.parentPinHash).not.toBe(first.parentPinHash);

		const actions = (await store.audit_logs.list({ familyId: actor.familyId })).map((a) => a.action);
		expect(actions).toEqual(expect.arrayContaining(["parent.pin_set", "parent.pin_reset"]));
	});

	it("unlocks with the right PIN and refuses a wrong one", async () => {
		await setParentPin({ store, auth }, user, actor, { password: PASSWORD, pin: "4826" });
		await expect(unlockParentArea({ store, auth }, actor, "1111")).rejects.toThrow("Incorrect PIN.");
		expect((await unlockParentArea({ store, auth }, actor, "4826"))?.id).toBe(actor.familyId);
	});

	it("limits PIN guesses per family, even with the right PIN after the limit", async () => {
		await setParentPin({ store, auth }, user, actor, { password: PASSWORD, pin: "4826" });
		for (let i = 0; i < PIN_ATTEMPTS.limit; i += 1) {
			await expect(unlockParentArea({ store, auth }, actor, String(1000 + i))).rejects.toThrow("Incorrect PIN.");
		}
		const blocked = await unlockParentArea({ store, auth }, actor, "4826").catch((e) => e);
		expect(blocked).toBeInstanceOf(AppError);
		expect((blocked as AppError).code).toBe("rate_limited");
	});
});
