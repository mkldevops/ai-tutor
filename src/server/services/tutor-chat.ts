import { type GuardEvent, guardReply, leaksAnswer } from "#/ai/reply-guard";
import { getObjective } from "#/curriculum/england-nc-maths";
import { currentItem } from "#/learning-engine/lesson";
import { rateLimit } from "../rate-limit";
import type { DataStore, LearningSessionRecord } from "../store/types";
import { AppError, notFound } from "./errors";
import { type Actor, audit } from "./family";

export const TUTOR_CHAT_LIMITS = {
	messageChars: 500,
	historyMessages: 12,
	replyChars: 1500,
	perMinute: 8,
} as const;

export const TUTORING_PHASES = new Set(["instruction", "guided"]);

export type ChatTurn = { role: "user" | "assistant"; content: string };
export type TutorStreamer = (turns: ChatTurn[], context: string) => Promise<AsyncIterable<string>>;
export type TutorChatScope = { studentId: string; objectiveCode: string };

export type TutorChatDeps = {
	store: DataStore;
	dailyCallsPerFamily: number;
	retentionDays: number;
	createStreamer: (scope: TutorChatScope) => TutorStreamer | null;
	now?: () => Date;
};

export type TutorChatEvent = GuardEvent | { type: "failed"; text: string };

export const UNAVAILABLE_TEXT = "The AI tutor is not switched on for this family.";
export const FAILED_TEXT = "Sorry, I can't answer right now. Please try again in a moment.";

async function requireTutoringSession(store: DataStore, actor: Actor, sessionId: string) {
	const session = await store.learning_sessions.get(sessionId);
	if (!session || session.familyId !== actor.familyId) throw notFound("Session");
	return session;
}

export function forbiddenAnswers(session: LearningSessionRecord): string[] {
	if (session.state.phase !== "guided") return [];
	const item = currentItem(session.state);
	if (!item) return [];
	return [item.answer].filter((a) => !leaksAnswer(item.prompt, [a]));
}

export function lessonContext(session: LearningSessionRecord): string {
	const objective = getObjective(session.objectiveCode);
	const lines = [`Objective: ${objective?.statement ?? session.objectiveCode}`];
	if (session.state.phase === "instruction") {
		lines.push("The child is reading the explanation before practice.");
	} else {
		const item = currentItem(session.state);
		if (item) {
			lines.push(`The child is working on this practice question: "${item.prompt}".`);
			lines.push("Do not give its answer or the final result. Guide with one small step or a question.");
		}
	}
	return lines.join("\n");
}

async function pruneExpired(store: DataStore, studentId: string, now: Date) {
	for (;;) {
		const rows = await store.session_messages.list({ studentId }, { limit: 50 });
		const expired = rows.filter((r) => r.expiresAt <= now.toISOString());
		for (const r of expired) await store.session_messages.delete(r.id);
		if (expired.length < rows.length || rows.length === 0) return;
	}
}

export async function listTutorMessages(store: DataStore, actor: Actor, sessionId: string, now = new Date()) {
	const session = await requireTutoringSession(store, actor, sessionId);
	const rows = await store.session_messages.list(
		{ sessionId: session.id, familyId: actor.familyId },
		{ limit: TUTOR_CHAT_LIMITS.historyMessages * 2, latest: true },
	);
	return rows
		.filter((r) => r.expiresAt > now.toISOString())
		.map((r) => ({ id: r.id, role: r.role === "child" ? ("user" as const) : ("assistant" as const), text: r.text }));
}

export async function startTutorChat(
	deps: TutorChatDeps,
	actor: Actor,
	input: { sessionId: string; message: string },
): Promise<AsyncIterable<TutorChatEvent>> {
	const { store } = deps;
	const now = deps.now?.() ?? new Date();
	const message = input.message.replace(/\s+/g, " ").trim();
	if (message.length === 0 || message.length > TUTOR_CHAT_LIMITS.messageChars) {
		throw new AppError("invalid", `Please write a message of up to ${TUTOR_CHAT_LIMITS.messageChars} characters.`);
	}
	const session = await requireTutoringSession(store, actor, input.sessionId);
	const target = `learning_sessions/${session.id}`;
	if (!TUTORING_PHASES.has(session.state.phase)) {
		await audit(store, actor, "tutor.chat_refused", target, { phase: session.state.phase });
		throw new AppError("forbidden", "Nova can't help during a check. Show what you know on your own!");
	}
	const streamer = deps.createStreamer({ studentId: session.studentId, objectiveCode: session.objectiveCode });
	if (!streamer) throw new AppError("forbidden", UNAVAILABLE_TEXT);
	rateLimit(`tutor-chat:${actor.userId}`, TUTOR_CHAT_LIMITS.perMinute, 60_000, now.getTime());
	rateLimit(`ai:${actor.familyId}`, deps.dailyCallsPerFamily, 24 * 60 * 60_000, now.getTime());

	await pruneExpired(store, session.studentId, now);
	const history = await listTutorMessages(store, actor, session.id, now);
	const expiresAt = new Date(now.getTime() + deps.retentionDays * 24 * 60 * 60_000).toISOString();
	const owner = { familyId: session.familyId, studentId: session.studentId, sessionId: session.id, expiresAt };
	await store.session_messages.create({ ...owner, role: "child", text: message });

	const turns: ChatTurn[] = [
		...history.slice(-TUTOR_CHAT_LIMITS.historyMessages).map((m) => ({ role: m.role, content: m.text })),
		{ role: "user", content: message },
	];
	const forbidden = forbiddenAnswers(session);
	const started = Date.now();

	return (async function* () {
		let reply = "";
		let outcome = "ok";
		try {
			const source = await streamer(turns, lessonContext(session));
			for await (const event of guardReply(source, {
				forbiddenAnswers: forbidden,
				maxChars: TUTOR_CHAT_LIMITS.replyChars,
			})) {
				reply += event.text;
				if (event.type === "stopped") outcome = event.reason;
				yield event;
			}
		} catch (e) {
			outcome = "error";
			console.error("[ai-tutor] tutor chat failed", e instanceof Error ? e.message : e);
			const text = reply ? ` ${FAILED_TEXT}` : FAILED_TEXT;
			reply += text;
			yield { type: "failed", text };
		} finally {
			const text = reply.trim().slice(0, 2000);
			if (text) await store.session_messages.create({ ...owner, role: "tutor", text });
			await audit(store, actor, "tutor.chat", target, {
				phase: session.state.phase,
				outcome,
				ms: Date.now() - started,
				childChars: message.length,
				replyChars: text.length,
			});
		}
	})();
}
