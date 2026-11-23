import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryAuth } from "./auth/provider";
import { resetRateLimits } from "./rate-limit";
import { AppError } from "./services/errors";
import { createFamilyForUser } from "./services/family";
import { setParentPin } from "./services/parent-lock";
import { createMemoryStore } from "./store/memory-store";

const jar = new Map<string, string>();

vi.mock("@tanstack/react-start/server-only", () => ({}));
vi.mock("@tanstack/react-start/server", () => ({
	getCookie: (name: string) => jar.get(name),
	setCookie: (name: string, value: string) => jar.set(name, value),
	deleteCookie: (name: string) => jar.delete(name),
	getRequestHeader: () => undefined,
	getRequestIP: () => "203.0.113.7",
}));

const ctx = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("./context", () => ({ getServerContext: () => ctx.value }));

const { requireKnowledgeAdmin, grantParentUnlock, clearParentUnlock, SESSION_COOKIE } = await import("./session");

const PASSWORD = "correct horse battery";

async function setup(email: string) {
	const store = createMemoryStore();
	const auth = createMemoryAuth();
	ctx.value = { store, auth, config: { KNOWLEDGE_ADMIN_EMAILS: ["admin@example.test"], NODE_ENV: "test" } };
	const { user, sessionSecret } = await auth.signUp(email, PASSWORD, "Admin");
	const actor = await createFamilyForUser(store, user.id, "Admin family");
	jar.set(SESSION_COOKIE, sessionSecret);
	return { store, auth, user, actor };
}

async function code(p: Promise<unknown>) {
	const e = await p.then(
		() => null,
		(err: unknown) => err,
	);
	return e instanceof AppError ? e.code : e;
}

describe("knowledge admin guard", () => {
	beforeEach(() => {
		jar.clear();
		resetRateLimits();
	});

	it("allows an admin whose family has no PIN", async () => {
		await setup("admin@example.test");
		expect(await code(requireKnowledgeAdmin())).toBeNull();
	});

	it("refuses an admin while the parent area is locked and allows them once unlocked", async () => {
		const { store, auth, user, actor } = await setup("admin@example.test");
		const family = await setParentPin({ store, auth }, user, actor, { password: PASSWORD, pin: "4826" });
		expect(await code(requireKnowledgeAdmin())).toBe("parent_locked");

		grantParentUnlock(family);
		expect(await code(requireKnowledgeAdmin())).toBeNull();

		clearParentUnlock();
		expect(await code(requireKnowledgeAdmin())).toBe("parent_locked");
	});

	it("keeps hiding the area from non-admins, locked or not", async () => {
		const { store, auth, user, actor } = await setup("parent@example.test");
		expect(await code(requireKnowledgeAdmin())).toBe("not_found");
		await setParentPin({ store, auth }, user, actor, { password: PASSWORD, pin: "4826" });
		expect(await code(requireKnowledgeAdmin())).toBe("not_found");
	});

	it("refuses an unauthenticated request", async () => {
		await setup("admin@example.test");
		jar.clear();
		expect(await code(requireKnowledgeAdmin())).toBe("unauthenticated");
	});
});
