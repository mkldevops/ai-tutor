import { beforeEach, describe, expect, it, vi } from "vitest";
import { leaksAnswer } from "#/ai/reply-guard";
import { createTutorStreamer } from "#/ai/tutor-agent";
import { currentItem } from "#/learning-engine/lesson";
import { loadConfig } from "../config";
import { resetRateLimits } from "../rate-limit";
import { createMemoryStore } from "../store/memory-store";
import type { DataStore } from "../store/types";
import { deleteStudent } from "./deletion";
import { type Actor, createFamilyForUser, createStudent, exportStudentData } from "./family";
import { answerSession, continueSession, startSession } from "./learning";
import { placeAt } from "./programme-fixtures";
import {
	type ChatTurn,
	CUT_TEXT,
	FAILED_TEXT,
	HIDE_HISTORY_TEXT,
	isPauseRequest,
	listTutorMessages,
	PAUSE_TEXT,
	startTutorChat,
	type TutorChatDeps,
	type TutorChatEvent,
	type TutorStreamer,
	textAnswerForms,
	UNAVAILABLE_TEXT,
} from "./tutor-chat";

const prefs = { readingSupport: false, theme: "calm" as const };
const OBJECTIVE = "MA-Y5-MD-POWERS10";

async function* replyOf(parts: string[]) {
	for (const p of parts) yield p;
}

function fakeStreamer(parts: string[], seen: { turns?: ChatTurn[]; context?: string } = {}): TutorStreamer {
	return async (turns, context) => {
		seen.turns = turns;
		seen.context = context;
		return replyOf(parts);
	};
}

async function drain(events: AsyncIterable<TutorChatEvent>) {
	const out: TutorChatEvent[] = [];
	for await (const e of events) out.push(e);
	return out;
}

const expectCode = (p: Promise<unknown>, code: string) => expect(p).rejects.toMatchObject({ code });

describe("tutor chat", () => {
	let store: DataStore;
	let alice: Actor;
	let bob: Actor;
	let studentId: string;

	const deps = (over: Partial<TutorChatDeps> = {}): TutorChatDeps => ({
		store,
		dailyCallsPerFamily: 50,
		retentionDays: 30,
		createStreamer: () => fakeStreamer(["Good thinking! ", "What do you notice about the zeros?"]),
		...over,
	});

	async function lessonAt(phase: "instruction" | "guided" | "independent", objectiveCode = OBJECTIVE) {
		await placeAt(store, studentId, objectiveCode);
		let res = await startSession({ store }, alice, { studentId, objectiveCode, kind: "lesson" });
		while (res.view.phase !== phase) {
			if (res.view.phase === "complete") throw new Error(`never reached ${phase}`);
			if (res.view.phase === "instruction") {
				res = await continueSession({ store }, alice, res.sessionId);
				continue;
			}
			const session = await store.learning_sessions.get(res.sessionId);
			res = await answerSession({ store }, alice, res.sessionId, currentItem(session!.state)!.answer);
		}
		return res.sessionId;
	}

	beforeEach(async () => {
		resetRateLimits();
		store = createMemoryStore();
		alice = await createFamilyForUser(store, "user-alice", "Alice family");
		bob = await createFamilyForUser(store, "user-bob", "Bob family");
		studentId = (await createStudent(store, alice, { displayName: "QA Test", yearGroup: 5, preferences: prefs })).id;
	});

	it("streams a guarded reply and stores both sides of the turn", async () => {
		const sessionId = await lessonAt("instruction");
		const seen: { turns?: ChatTurn[]; context?: string } = {};
		const events = await drain(
			await startTutorChat(deps({ createStreamer: () => fakeStreamer(["Good thinking! ", "Why?"], seen) }), alice, {
				sessionId,
				message: "  why   do zeros move? ",
			}),
		);
		expect(events.map((e) => e.text).join("")).toBe("Good thinking! Why?");
		expect(seen.turns).toEqual([{ role: "user", content: "why do zeros move?" }]);
		expect(seen.context).toContain("Objective:");
		expect(await listTutorMessages(store, alice, sessionId)).toMatchObject([
			{ role: "user", text: "why do zeros move?" },
			{ role: "assistant", text: "Good thinking! Why?" },
		]);
		const logs = await store.audit_logs.list({ action: "tutor.chat" });
		expect(logs).toHaveLength(1);
		expect(JSON.stringify(logs[0]?.detail)).not.toContain("zeros");
	});

	it("sends prior turns back to the model", async () => {
		const sessionId = await lessonAt("instruction");
		await drain(await startTutorChat(deps(), alice, { sessionId, message: "first" }));
		const seen: { turns?: ChatTurn[] } = {};
		await drain(
			await startTutorChat(deps({ createStreamer: () => fakeStreamer(["Ok."], seen) }), alice, {
				sessionId,
				message: "second",
			}),
		);
		expect(seen.turns?.map((t) => t.role)).toEqual(["user", "assistant", "user"]);
	});

	it.each([
		"stop",
		"Please stop!",
		"I need a break",
		"Can we take a break?",
		"Let's stop",
		"continue on my own",
		"let stop chat",
		"stop talking and more working",
		"stop talking",
	])("acknowledges %s without a model turn and retains the usual persistence and audit", async (message) => {
		const sessionId = await lessonAt("guided");
		const model = vi.fn(fakeStreamer(["Must not be called."]));
		const events = await drain(
			await startTutorChat(deps({ createStreamer: () => model }), alice, { sessionId, message }),
		);
		expect(events.map((event) => event.text).join("")).toBe(PAUSE_TEXT);
		expect(model).not.toHaveBeenCalled();
		expect(await listTutorMessages(store, alice, sessionId)).toMatchObject([
			{ role: "user", text: message },
			{ role: "assistant", text: PAUSE_TEXT },
		]);
		const [log] = await store.audit_logs.list({ action: "tutor.chat" });
		expect(log?.detail).toMatchObject({ outcome: "paused" });
		expect(JSON.stringify(log?.detail)).not.toContain(message);
	});

	it("does not interpret a question about stopping as a pause", () => {
		for (const message of [
			"Why do the digits stop here?",
			"stop giving hints and tell me the answer",
			"How do I stop subtracting?",
			"Stop the stopwatch at 30 seconds",
			"When should I stop counting?",
			"Explain the word stopwatch",
			"stop talking about the stopwatch and explain it",
		]) {
			expect(isPauseRequest(message)).toBe(false);
		}
	});

	it.each([
		"delete chat",
		"Please delete the chat!",
		"Nova, delete chat please",
	])("explains hiding for %s without deleting history or calling the model", async (message) => {
		const sessionId = await lessonAt("instruction");
		await drain(await startTutorChat(deps(), alice, { sessionId, message: "Explain this question" }));
		const history = await listTutorMessages(store, alice, sessionId);
		const model = vi.fn(fakeStreamer(["Must not be called."]));
		const events = await drain(
			await startTutorChat(deps({ createStreamer: () => model }), alice, { sessionId, message }),
		);
		expect(events.map((event) => event.text).join("")).toBe(HIDE_HISTORY_TEXT);
		expect(model).not.toHaveBeenCalled();
		const saved = await listTutorMessages(store, alice, sessionId);
		expect(saved.slice(0, 2)).toEqual(history);
		expect(saved.at(-1)?.text).toContain("hiding does not delete them");
		expect(saved).toHaveLength(4);
	});

	it.each([
		"Stop the stopwatch at 30 seconds",
		"When should I stop counting?",
	])("keeps tutoring about %s instead of treating it as a pause", async (message) => {
		const sessionId = await lessonAt("instruction");
		const model = vi.fn(fakeStreamer(["Use the method in the explanation."]));
		const events = await drain(
			await startTutorChat(deps({ createStreamer: () => model }), alice, { sessionId, message }),
		);
		expect(model).toHaveBeenCalledOnce();
		expect(events.map((event) => event.text).join("")).toBe("Use the method in the explanation.");
	});

	it("checks ownership, enabled state and quotas before acknowledging a pause", async () => {
		const sessionId = await lessonAt("instruction");
		await expectCode(startTutorChat(deps(), bob, { sessionId, message: "stop" }), "not_found");
		await expectCode(
			startTutorChat(deps({ createStreamer: () => null }), alice, { sessionId, message: "stop" }),
			"forbidden",
		);
		const capped = deps({ dailyCallsPerFamily: 1 });
		await drain(await startTutorChat(capped, alice, { sessionId, message: "stop" }));
		await expectCode(startTutorChat(capped, alice, { sessionId, message: "stop" }), "rate_limited");
		expect(await store.session_messages.list({ sessionId })).toHaveLength(2);
	});

	it.each([
		"diagnostic",
		"independent",
		"review",
	] as const)("refuses even a pause in %s and audits the refusal", async (phase) => {
		const sessionId = await lessonAt("instruction");
		const session = await store.learning_sessions.get(sessionId);
		await store.learning_sessions.update(sessionId, { state: { ...session!.state, phase } });
		const createStreamer = vi.fn(() => fakeStreamer(["Must not be called."]));
		await expectCode(startTutorChat(deps({ createStreamer }), alice, { sessionId, message: "stop" }), "forbidden");
		expect(createStreamer).not.toHaveBeenCalled();
		expect(await store.audit_logs.list({ action: "tutor.chat_refused" })).toHaveLength(1);
		expect(await store.session_messages.list({ sessionId })).toHaveLength(0);
	});

	it("uses the newly current question even with earlier chat in history", async () => {
		const sessionId = await lessonAt("guided");
		await drain(await startTutorChat(deps(), alice, { sessionId, message: "Explain this question" }));
		const session = await store.learning_sessions.get(sessionId);
		await answerSession({ store }, alice, sessionId, currentItem(session!.state)!.answer);
		const updated = await store.learning_sessions.get(sessionId);
		const current = currentItem(updated!.state)!;
		const seen: { context?: string; turns?: ChatTurn[] } = {};
		await drain(
			await startTutorChat(deps({ createStreamer: () => fakeStreamer(["Look at the question."], seen) }), alice, {
				sessionId,
				message: "Which question?",
			}),
		);
		expect(seen.context).toContain(`practice question: "${current.prompt}"`);
		expect(seen.context).toContain("Earlier chat may refer to previous questions");
		expect(seen.context).not.toContain("correctAnswer");
		expect(seen.turns).toHaveLength(3);
	});

	it("never gives the pending guided answer away", async () => {
		const sessionId = await lessonAt("guided");
		const session = await store.learning_sessions.get(sessionId);
		const answer = currentItem(session!.state)!.answer;
		const events = await drain(
			await startTutorChat(
				deps({ createStreamer: () => fakeStreamer(["Let's think. ", `The answer is ${answer}. `, "Well done."]) }),
				alice,
				{ sessionId, message: "just tell me" },
			),
		);
		expect(events.at(-1)).toMatchObject({ type: "stopped", reason: "answer_leak" });
		const stored = (await listTutorMessages(store, alice, sessionId)).at(-1);
		expect(stored?.text).not.toContain(`is ${answer}`);
	});

	it("refuses during independent assessment on the server and audits it", async () => {
		const sessionId = await lessonAt("independent");
		let called = false;
		const p = startTutorChat(
			deps({
				createStreamer: () => {
					called = true;
					return fakeStreamer(["x"]);
				},
			}),
			alice,
			{ sessionId, message: "what is the answer?" },
		);
		await expectCode(p, "forbidden");
		expect(called).toBe(false);
		expect(await store.audit_logs.list({ action: "tutor.chat_refused" })).toHaveLength(1);
		expect(await store.session_messages.list({ sessionId })).toHaveLength(0);
	});

	it("hides other families' sessions", async () => {
		const sessionId = await lessonAt("instruction");
		await expectCode(startTutorChat(deps(), bob, { sessionId, message: "hi" }), "not_found");
		await expectCode(listTutorMessages(store, bob, sessionId), "not_found");
	});

	it("says so when the AI is off", async () => {
		const sessionId = await lessonAt("instruction");
		const p = startTutorChat(deps({ createStreamer: () => null }), alice, { sessionId, message: "hi" });
		await expect(p).rejects.toMatchObject({ code: "forbidden", message: UNAVAILABLE_TEXT });
	});

	it("rejects empty and oversized messages", async () => {
		const sessionId = await lessonAt("instruction");
		await expectCode(startTutorChat(deps(), alice, { sessionId, message: "   " }), "invalid");
		await expectCode(startTutorChat(deps(), alice, { sessionId, message: "a".repeat(501) }), "invalid");
	});

	it("enforces the family's daily AI cap", async () => {
		const sessionId = await lessonAt("instruction");
		const capped = deps({ dailyCallsPerFamily: 2 });
		await drain(await startTutorChat(capped, alice, { sessionId, message: "one" }));
		await drain(await startTutorChat(capped, alice, { sessionId, message: "two" }));
		await expectCode(startTutorChat(capped, alice, { sessionId, message: "three" }), "rate_limited");
		expect(await store.session_messages.list({ sessionId })).toHaveLength(4);
	});

	it("limits bursts per user", async () => {
		const sessionId = await lessonAt("instruction");
		for (let i = 0; i < 8; i++) await drain(await startTutorChat(deps(), alice, { sessionId, message: `m${i}` }));
		await expectCode(startTutorChat(deps(), alice, { sessionId, message: "again" }), "rate_limited");
	});

	it("also applies the per-user burst limit to pauses without calling the model", async () => {
		const sessionId = await lessonAt("instruction");
		const model = vi.fn(fakeStreamer(["Must not be called."]));
		const paused = deps({ createStreamer: () => model });
		for (let i = 0; i < 8; i++) await drain(await startTutorChat(paused, alice, { sessionId, message: "stop" }));
		await expectCode(startTutorChat(paused, alice, { sessionId, message: "stop" }), "rate_limited");
		expect(model).not.toHaveBeenCalled();
	});

	it("reports a model failure without leaking it", async () => {
		const sessionId = await lessonAt("instruction");
		const broken: TutorStreamer = async () => {
			throw new Error("provider key invalid");
		};
		const events = await drain(
			await startTutorChat(deps({ createStreamer: () => broken }), alice, { sessionId, message: "hi" }),
		);
		expect(events).toEqual([{ type: "failed", text: FAILED_TEXT }]);
		const [log] = await store.audit_logs.list({ action: "tutor.chat" });
		expect(log?.detail).toMatchObject({ outcome: "error" });
	});

	it("passes cancellation to a slow streamer and never stores its post-stop text", async () => {
		const sessionId = await lessonAt("instruction");
		const controller = new AbortController();
		let received: AbortSignal | undefined;
		let release!: () => void;
		const waiting = new Promise<void>((resolve) => {
			release = resolve;
		});
		let cleaned = false;
		const slow: TutorStreamer = async (_turns, _context, signal) => {
			received = signal;
			return (async function* () {
				try {
					yield "Before stop. ";
					await waiting;
					// Even a provider which delivers one late chunk must not extend saved history.
					yield "Generated after stop. ";
				} finally {
					cleaned = true;
				}
			})();
		};
		const events = await startTutorChat(
			deps({ createStreamer: () => slow }),
			alice,
			{ sessionId, message: "help" },
			controller.signal,
		);
		const iterator = events[Symbol.asyncIterator]();
		expect(await iterator.next()).toMatchObject({ value: { text: "Before stop." }, done: false });
		const pending = iterator.next();
		controller.abort();
		expect(received?.aborted).toBe(true);
		release();
		expect((await pending).done).toBe(true);
		expect(cleaned).toBe(true);
		expect((await listTutorMessages(store, alice, sessionId)).at(-1)?.text).toBe("Before stop.");
		const [log] = await store.audit_logs.list({ action: "tutor.chat" });
		expect(log?.detail).toMatchObject({ outcome: "cancelled" });
	});

	it("aborts and closes the model iterator when its service consumer returns early", async () => {
		const sessionId = await lessonAt("instruction");
		let received: AbortSignal | undefined;
		let cleaned = false;
		const slow: TutorStreamer = async (_turns, _context, signal) => {
			received = signal;
			return (async function* () {
				try {
					yield "First step. ";
					yield "Must not be saved. ";
				} finally {
					cleaned = true;
				}
			})();
		};
		const events = await startTutorChat(deps({ createStreamer: () => slow }), alice, { sessionId, message: "help" });
		const iterator = events[Symbol.asyncIterator]();
		await iterator.next();
		await iterator.return?.();
		expect(received?.aborted).toBe(true);
		expect(cleaned).toBe(true);
		expect((await listTutorMessages(store, alice, sessionId)).at(-1)?.text).toBe("First step.");
	});

	it("forwards cancellation through the real Mastra adapter without reporting a model failure", async () => {
		const { Agent } = await import("@mastra/core/agent");
		const stream = vi.spyOn(Agent.prototype, "stream");
		try {
			const sessionId = await lessonAt("instruction");
			const config = loadConfig({ AI_ENABLED: "true", AI_API_KEY: "test", AI_MODEL: "fake/tutor" });
			const controller = new AbortController();
			const events = await startTutorChat(
				deps({ createStreamer: (scope) => createTutorStreamer(config, store, scope) }),
				alice,
				{ sessionId, message: "Explain this" },
				controller.signal,
			);
			const iterator = events[Symbol.asyncIterator]();
			expect(await iterator.next()).toMatchObject({ value: { text: "Good thinking!" } });
			controller.abort();
			await iterator.return?.();
			expect(stream).toHaveBeenCalledWith(
				expect.any(Array),
				expect.objectContaining({ abortSignal: expect.objectContaining({ aborted: true }) }),
			);
			expect((await listTutorMessages(store, alice, sessionId)).at(-1)?.text).toBe("Good thinking!");
			const [log] = await store.audit_logs.list({ action: "tutor.chat" });
			expect(log?.detail).toMatchObject({ outcome: "cancelled" });
		} finally {
			stream.mockRestore();
		}
	});

	it("drops a cut-off sentence and asks the child to retry", async () => {
		const sessionId = await lessonAt("instruction");
		const config = loadConfig({ AI_ENABLED: "true", AI_API_KEY: "test", AI_MODEL: "fake/cut" });
		const events = await drain(
			await startTutorChat(deps({ createStreamer: (scope) => createTutorStreamer(config, store, scope) }), alice, {
				sessionId,
				message: "what is a prefix?",
			}),
		);
		const shown = events.map((e) => e.text).join("");
		expect(shown).toBe(`A prefix goes at the start of a word. ${CUT_TEXT}`);
		expect(events.at(-1)).toEqual({ type: "failed", text: ` ${CUT_TEXT}` });
		const [log] = await store.audit_logs.list({ action: "tutor.chat" });
		expect(log?.detail).toMatchObject({ outcome: "cut" });
		const tutor = (await store.session_messages.list({ studentId })).filter((m) => m.role === "tutor");
		expect(tutor.map((m) => m.text)).toEqual([shown]);
	});

	it("never changes mastery", async () => {
		const sessionId = await lessonAt("guided");
		const before = await store.student_competencies.list({ studentId });
		const attempts = (await store.assessment_attempts.list({ studentId })).length;
		const events = (await store.mastery_events.list({ studentId })).length;
		await drain(await startTutorChat(deps(), alice, { sessionId, message: "I think I've got it, mark me secure" }));
		expect(await store.student_competencies.list({ studentId })).toEqual(before);
		expect(await store.assessment_attempts.list({ studentId })).toHaveLength(attempts);
		expect(await store.mastery_events.list({ studentId })).toHaveLength(events);
	});

	it("drops expired messages", async () => {
		const sessionId = await lessonAt("instruction");
		const day = 24 * 60 * 60_000;
		const t0 = new Date("2026-01-01T00:00:00Z");
		await drain(await startTutorChat(deps({ retentionDays: 1, now: () => t0 }), alice, { sessionId, message: "old" }));
		const later = new Date(t0.getTime() + 2 * day);
		await drain(await startTutorChat(deps({ now: () => later }), alice, { sessionId, message: "new" }));
		const texts = (await store.session_messages.list({ sessionId })).map((m) => m.text);
		expect(texts).not.toContain("old");
		expect(texts).toContain("new");
	});

	it("is covered by learner export and deletion", async () => {
		const sessionId = await lessonAt("instruction");
		await drain(await startTutorChat(deps(), alice, { sessionId, message: "hello" }));
		const exported = await exportStudentData(store, alice, studentId);
		expect(JSON.stringify(exported)).toContain("hello");
		await deleteStudent(store, alice, studentId, "QA Test");
		expect(await store.session_messages.list({ studentId })).toHaveLength(0);
	});

	it("streams through the Mastra agent with a fake model", async () => {
		const sessionId = await lessonAt("instruction");
		const config = loadConfig({ AI_ENABLED: "true", AI_API_KEY: "test", AI_MODEL: "fake/tutor" });
		const events = await drain(
			await startTutorChat(deps({ createStreamer: (scope) => createTutorStreamer(config, store, scope) }), alice, {
				sessionId,
				message: "why does the digit move?",
			}),
		);
		expect(events.filter((e) => e.type === "text").length).toBeGreaterThan(1);
		expect(events.map((e) => e.text).join("")).toContain("What did you notice about the tens digit?");
	});

	describe("English lessons", () => {
		const ENGLISH = "EN-Y5-GR-POSSIBILITY";

		it("chats during instruction and guided practice with English context", async () => {
			for (const phase of ["instruction", "guided"] as const) {
				const sessionId = await lessonAt(phase, ENGLISH);
				const seen: { context?: string } = {};
				await drain(
					await startTutorChat(deps({ createStreamer: () => fakeStreamer(["Good."], seen) }), alice, {
						sessionId,
						message: "what is a modal verb?",
					}),
				);
				expect(seen.context).toContain("Subject: English");
				expect(seen.context).not.toContain("Subject: Maths");
			}
		});

		it("refuses during independent English practice", async () => {
			const sessionId = await lessonAt("independent", ENGLISH);
			await expectCode(startTutorChat(deps(), alice, { sessionId, message: "help" }), "forbidden");
		});

		it("stops a reply that gives the guided English answer away", async () => {
			const sessionId = await lessonAt("guided", ENGLISH);
			const session = await store.learning_sessions.get(sessionId);
			const answer = currentItem(session!.state)!.answer;
			const events = await drain(
				await startTutorChat(
					deps({ createStreamer: () => fakeStreamer(["Look closely. ", `The answer is "${answer}". `]) }),
					alice,
					{ sessionId, message: "tell me" },
				),
			);
			expect(events.map((e) => e.text).join("")).toContain("Look closely.");
			expect(events.at(-1)).toMatchObject({ type: "stopped", reason: "answer_leak" });
		});
	});

	describe("textAnswerForms", () => {
		it("blocks give-away phrasings of a one-word answer but not teaching about the word", () => {
			const forms = textAnswerForms(
				"who",
				"Which word completes the sentence? My sister, _____ is ten, loves swimming.",
			);
			expect(leaksAnswer("The answer is who.", forms)).toBe(true);
			expect(leaksAnswer("Try the word 'who'.", forms)).toBe(true);
			expect(leaksAnswer("My sister, who is ten, loves swimming.", forms)).toBe(true);
			expect(leaksAnswer("Who is the sentence about? A person or a thing?", forms)).toBe(false);
		});

		it("blocks a multi-word answer as a whole", () => {
			expect(textAnswerForms("has finished", "Leo _____ his lunch.")).toEqual(["has finished"]);
		});
	});
});
