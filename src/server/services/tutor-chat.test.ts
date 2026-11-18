import { beforeEach, describe, expect, it } from "vitest";
import { createTutorStreamer } from "#/ai/tutor-agent";
import { currentItem } from "#/learning-engine/lesson";
import { loadConfig } from "../config";
import { resetRateLimits } from "../rate-limit";
import { createMemoryStore } from "../store/memory-store";
import type { DataStore } from "../store/types";
import { type Actor, createFamilyForUser, createStudent, deleteStudent, exportStudentData } from "./family";
import { answerSession, continueSession, startSession } from "./learning";
import {
	type ChatTurn,
	FAILED_TEXT,
	listTutorMessages,
	startTutorChat,
	type TutorChatDeps,
	type TutorChatEvent,
	type TutorStreamer,
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

	async function lessonAt(phase: "instruction" | "guided" | "independent") {
		let res = await startSession({ store }, alice, { studentId, objectiveCode: OBJECTIVE, kind: "lesson" });
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
		await deleteStudent(store, alice, studentId);
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
});
