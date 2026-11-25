import { type GuardEvent, guardReply, leaksAnswer, ReplyCutError } from "#/ai/reply-guard";
import { getObjective } from "#/curriculum/england-nc";
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
export type TutorStreamer = (
	turns: ChatTurn[],
	context: string,
	abortSignal?: AbortSignal,
) => Promise<AsyncIterable<string>>;
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
export const PAUSE_TEXT = "Okay, we can stop here. You can take a break or continue on your own.";
export const HIDE_HISTORY_TEXT =
	"You can use Hide Nova to close this chat. Saved messages will still be here when you open Nova again; hiding does not delete them.";

const HIDE_HISTORY_REQUEST = /^(?:(?:please|nova) )?delete (?:the )?chat(?: please)?$/;

function normaliseControlRequest(message: string): string {
	return message
		.toLowerCase()
		.replace(/[’]/g, "'")
		.replace(/[.!?,]/g, "")
		.trim();
}

// Match complete, unambiguous requests only: e.g. not ‘stop the digits moving’.
export function isPauseRequest(message: string): boolean {
	const text = normaliseControlRequest(message);
	return (
		HIDE_HISTORY_REQUEST.test(text) ||
		/^(?:(?:please|nova) )?(?:stop|pause|stop please|stop nova|stop explaining|stop asking questions|stop talking(?: and more working)?|let stop chat|lets stop|let's stop|i (?:want|need) (?:to stop|a break)|can (?:we|i) (?:stop|take a break)|(?:i want to )?continue (?:alone|on my own)|no more questions)(?: please)?$/.test(
			text,
		)
	);
}

export const CUT_TEXT = "Oops, I lost my words there. Can you ask me again?";
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
	if (!Number.isFinite(Number(item.answer))) return textAnswerForms(item.answer, item.prompt);
	return [item.answer].filter((a) => !leaksAnswer(item.prompt, [a]));
}

const GIVE_AWAY = ["answer is", "answer:", "word", "it is", "it's", "use", "choose", "pick", "write"];

export function textAnswerForms(answer: string, prompt: string): string[] {
	const word = answer.trim();
	if (/\s/.test(word)) return [word];
	const forms = [`"${word}"`, `'${word}'`, `*${word}*`, ...GIVE_AWAY.map((g) => `${g} ${word}`)];
	const gap = prompt.match(/(\S+)\s+_{3,}\s+(\S+)/);
	if (gap) forms.push(`${gap[1]} ${word} ${gap[2]}`);
	return forms;
}

export function lessonContext(session: LearningSessionRecord): string {
	const objective = getObjective(session.objectiveCode);
	const lines = [
		"This is the current lesson context for this turn. Earlier chat may refer to previous questions or examples; do not treat them as the current question.",
		`Subject: ${objective?.subject === "english" ? "English (spelling, grammar and punctuation)" : "Maths"}`,
		`Objective: ${objective?.statement ?? session.objectiveCode}`,
	];
	if (session.state.phase === "instruction") {
		lines.push("The child is reading the explanation before practice.");
	} else {
		const item = currentItem(session.state);
		if (item) {
			lines.push(`The child is working on this practice question: "${item.prompt}".`);
			if (item.choices) lines.push(`The choices are: ${item.choices.map((c) => `"${c}"`).join(", ")}.`);
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
	abortSignal?: AbortSignal,
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
	await rateLimit(`tutor-chat:${actor.userId}`, TUTOR_CHAT_LIMITS.perMinute, 60_000, now.getTime());
	await rateLimit(`ai:${actor.familyId}`, deps.dailyCallsPerFamily, 24 * 60 * 60_000, now.getTime());
	abortSignal?.throwIfAborted();

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
	const controller = new AbortController();
	const signal = abortSignal ? AbortSignal.any([abortSignal, controller.signal]) : controller.signal;

	const events = (async function* (): AsyncGenerator<TutorChatEvent, void> {
		let reply = "";
		let outcome = "ok";
		try {
			signal.throwIfAborted();
			const paused = isPauseRequest(message);
			if (paused) outcome = "paused";
			const source = paused
				? (async function* () {
						yield HIDE_HISTORY_REQUEST.test(normaliseControlRequest(message)) ? HIDE_HISTORY_TEXT : PAUSE_TEXT;
					})()
				: await streamer(turns, lessonContext(session), signal);
			for await (const event of guardReply(source, {
				forbiddenAnswers: forbidden,
				maxChars: TUTOR_CHAT_LIMITS.replyChars,
			})) {
				if (signal.aborted) break;
				reply += event.text;
				if (event.type === "stopped") outcome = event.reason;
				yield event;
			}
		} catch (e) {
			if (signal.aborted) return;
			const cut = e instanceof ReplyCutError;
			outcome = cut ? "cut" : "error";
			console.error("[ai-tutor] tutor chat failed", e instanceof Error ? e.message : e);
			const notice = cut ? CUT_TEXT : FAILED_TEXT;
			const text = reply ? ` ${notice}` : notice;
			reply += text;
			yield { type: "failed", text };
		} finally {
			if (signal.aborted) outcome = "cancelled";
			// Also release model work when a guard or the iterator consumer ends the reply early.
			controller.abort();
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
	return {
		[Symbol.asyncIterator]() {
			return {
				next: () => events.next(),
				return: () => {
					controller.abort();
					return events.return();
				},
			};
		},
	};
}
