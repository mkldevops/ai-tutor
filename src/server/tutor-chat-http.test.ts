import { beforeEach, describe, expect, it } from "vitest";
import { AuthError } from "./auth/provider";
import { resetRateLimits } from "./rate-limit";
import { type Actor, createFamilyForUser, createStudent } from "./services/family";
import { startSession } from "./services/learning";
import type { TutorChatDeps } from "./services/tutor-chat";
import { createMemoryStore } from "./store/memory-store";
import type { DataStore } from "./store/types";
import { handleTutorChat, MAX_BODY_BYTES } from "./tutor-chat-http";

const prefs = { readingSupport: false, theme: "calm" as const };

async function* reply() {
	yield "Nice idea! ";
	yield "What happens to the 3?";
}

const post = (body: string, headers: Record<string, string> = { "content-type": "application/json" }) =>
	new Request("http://localhost/api/tutor-chat", {
		method: "POST",
		body,
		headers: { "content-length": String(new TextEncoder().encode(body).byteLength), ...headers },
	});

describe("POST /api/tutor-chat", () => {
	let store: DataStore;
	let actor: Actor;
	let sessionId: string;
	let deps: TutorChatDeps;
	const signedIn = () => Promise.resolve({ actor });
	const setPhase = async (phase: "instruction" | "independent") => {
		const session = await store.learning_sessions.get(sessionId);
		await store.learning_sessions.update(sessionId, { state: { ...session!.state, phase } });
	};

	beforeEach(async () => {
		resetRateLimits();
		store = createMemoryStore();
		actor = await createFamilyForUser(store, "user-qa", "QA family");
		const studentId = (await createStudent(store, actor, { displayName: "QA Test", yearGroup: 5, preferences: prefs }))
			.id;
		sessionId = (
			await startSession({ store }, actor, { studentId, objectiveCode: "MA-Y5-MD-POWERS10", kind: "lesson" })
		).sessionId;
		await setPhase("instruction");
		deps = { store, dailyCallsPerFamily: 50, retentionDays: 30, createStreamer: () => async () => reply() };
	});

	it("streams the reply as a UI message stream", async () => {
		const res = await handleTutorChat(post(JSON.stringify({ sessionId, message: "why?" })), {
			requireActor: signedIn,
			deps,
		});
		expect(res.status).toBe(200);
		expect(res.headers.get("cache-control")).toBe("no-store");
		const body = await res.text();
		expect(body).toContain('"type":"text-delta"');
		expect(body).toContain("Nice idea!");
		expect(body).toContain("What happens to the 3?");
	});

	it("requires a signed-in parent", async () => {
		const res = await handleTutorChat(post(JSON.stringify({ sessionId, message: "hi" })), {
			requireActor: () => Promise.reject(new AuthError("Please sign in.", "unknown")),
			deps,
		});
		expect(res.status).toBe(401);
	});

	it("rejects oversized, unsized and non-JSON bodies", async () => {
		const big = JSON.stringify({ sessionId, message: "a".repeat(MAX_BODY_BYTES) });
		expect((await handleTutorChat(post(big), { requireActor: signedIn, deps })).status).toBe(413);
		const lying = { "content-type": "application/json", "content-length": "20" };
		expect((await handleTutorChat(post(big, lying), { requireActor: signedIn, deps })).status).toBe(413);
		const stream = new Request("http://localhost/api/tutor-chat", {
			method: "POST",
			body: new Blob([big]).stream(),
			headers: { "content-type": "application/json" },
			duplex: "half",
		} as RequestInit);
		expect((await handleTutorChat(stream, { requireActor: signedIn, deps })).status).toBe(411);
		const text = post("hi", { "content-type": "text/plain" });
		expect((await handleTutorChat(text, { requireActor: signedIn, deps })).status).toBe(400);
		expect((await handleTutorChat(post("{"), { requireActor: signedIn, deps })).status).toBe(400);
	});

	it("refuses chat once the lesson leaves tutoring mode", async () => {
		await setPhase("independent");
		const res = await handleTutorChat(post(JSON.stringify({ sessionId, message: "answer?" })), {
			requireActor: signedIn,
			deps,
		});
		expect(res.status).toBe(403);
		expect(await res.text()).toMatch(/can't help during a check/);
	});

	it("returns 429 once the family's daily cap is spent", async () => {
		const capped = { ...deps, dailyCallsPerFamily: 1 };
		const body = JSON.stringify({ sessionId, message: "hi" });
		await (await handleTutorChat(post(body), { requireActor: signedIn, deps: capped })).text();
		expect((await handleTutorChat(post(body), { requireActor: signedIn, deps: capped })).status).toBe(429);
	});
});
