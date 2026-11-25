import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthError } from "./auth/provider";
import { resetRateLimits } from "./rate-limit";
import { type Actor, createFamilyForUser, createStudent } from "./services/family";
import { startSession } from "./services/learning";
import { placeAt } from "./services/programme-fixtures";
import { listTutorMessages, type TutorChatDeps } from "./services/tutor-chat";
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
		await placeAt(store, studentId, "MA-Y5-MD-POWERS10");
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

	it.each([
		"reader",
		"request",
	] as const)("propagates %s cancellation into the streamer and persists only the stopped reply", async (cancelVia) => {
		const requestController = new AbortController();
		const request = new Request(post(JSON.stringify({ sessionId, message: "help" })), {
			signal: requestController.signal,
		});
		const removed = vi.spyOn(request.signal, "removeEventListener");
		let received: AbortSignal | undefined;
		let cleaned = false;
		const slow: TutorChatDeps = {
			...deps,
			createStreamer: () => async (_turns, _context, signal) => {
				received = signal;
				return (async function* () {
					let release!: () => void;
					const stopped = new Promise<void>((resolve) => {
						release = resolve;
					});
					signal!.addEventListener("abort", release, { once: true });
					try {
						yield "Before stop. ";
						await stopped;
						// Simulate a provider delivering a final in-flight chunk after cancellation.
						yield "Generated after stop. ";
					} finally {
						signal!.removeEventListener("abort", release);
						cleaned = true;
					}
				})();
			},
		};
		const response = await handleTutorChat(request, { requireActor: signedIn, deps: slow });
		const reader = response.body!.getReader();
		const decoder = new TextDecoder();
		let shown = "";
		while (!shown.includes("Before stop.")) {
			const chunk = await reader.read();
			expect(chunk.done).toBe(false);
			shown += decoder.decode(chunk.value);
		}
		if (cancelVia === "reader") await reader.cancel("Child stopped");
		else {
			requestController.abort();
			while (!(await reader.read()).done) {
				/* Drain the cancelled response. */
			}
		}
		expect(received?.aborted).toBe(true);
		await vi.waitFor(async () => {
			expect(await store.audit_logs.list({ action: "tutor.chat" })).toHaveLength(1);
		});
		expect(cleaned).toBe(true);
		const history = await listTutorMessages(store, actor, sessionId);
		expect(history.at(-1)?.text).toBe("Before stop.");
		expect(JSON.stringify(history)).not.toContain("Generated after stop");
		const [log] = await store.audit_logs.list({ action: "tutor.chat" });
		expect(log?.detail).toMatchObject({ outcome: "cancelled" });
		expect(removed).toHaveBeenCalledWith("abort", expect.any(Function));
		removed.mockRestore();
		reader.releaseLock();
	});

	it("requires a signed-in parent", async () => {
		const res = await handleTutorChat(post(JSON.stringify({ sessionId, message: "hi" })), {
			requireActor: () => Promise.reject(new AuthError("Please sign in.", "unknown")),
			deps,
		});
		expect(res.status).toBe(401);
	});

	it("streams a pause acknowledgement without calling the model", async () => {
		const model = vi.fn(async () => reply());
		const res = await handleTutorChat(post(JSON.stringify({ sessionId, message: "Please stop" })), {
			requireActor: signedIn,
			deps: { ...deps, createStreamer: () => model },
		});
		expect(res.status).toBe(200);
		expect(await res.text()).toContain("we can stop here");
		expect(model).not.toHaveBeenCalled();
	});

	it("does not let pause bypass authentication, family isolation or phase checks", async () => {
		const request = () => post(JSON.stringify({ sessionId, message: "stop" }));
		expect(
			(
				await handleTutorChat(request(), {
					requireActor: () => Promise.reject(new AuthError("Sign in", "unknown")),
					deps,
				})
			).status,
		).toBe(401);
		const other = await createFamilyForUser(store, "another-parent", "Other family");
		expect((await handleTutorChat(request(), { requireActor: async () => ({ actor: other }), deps })).status).toBe(404);
		await setPhase("independent");
		expect((await handleTutorChat(request(), { requireActor: signedIn, deps })).status).toBe(403);
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
