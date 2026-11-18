import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { z } from "zod";
import { AuthError } from "./auth/provider";
import { AppError, type AppErrorCode } from "./services/errors";
import type { Actor } from "./services/family";
import { FAILED_TEXT, startTutorChat, TUTOR_CHAT_LIMITS, type TutorChatDeps } from "./services/tutor-chat";

export const MAX_BODY_BYTES = 4096;

const bodySchema = z.object({
	sessionId: z.string().regex(/^[A-Za-z0-9_-]{1,36}$/),
	message: z.string().max(TUTOR_CHAT_LIMITS.messageChars * 2),
});

const STATUS: Record<AppErrorCode, number> = {
	unauthenticated: 401,
	forbidden: 403,
	not_found: 404,
	invalid: 400,
	conflict: 409,
	rate_limited: 429,
};

const textResponse = (status: number, message: string) =>
	new Response(message, {
		status,
		headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
	});

async function readBody(request: Request): Promise<unknown> {
	if (!request.headers.get("content-type")?.includes("application/json")) {
		throw new AppError("invalid", "Expected JSON.");
	}
	const declared = Number(request.headers.get("content-length") ?? "0");
	if (declared > MAX_BODY_BYTES) throw new AppError("invalid", "Message too large.");
	const raw = await request.text();
	if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) throw new AppError("invalid", "Message too large.");
	try {
		return JSON.parse(raw);
	} catch {
		throw new AppError("invalid", "Expected JSON.");
	}
}

export async function handleTutorChat(
	request: Request,
	ctx: { requireActor: () => Promise<{ actor: Actor }>; deps: TutorChatDeps },
): Promise<Response> {
	let events: AsyncIterable<{ type: string; text: string }>;
	try {
		const { actor } = await ctx.requireActor();
		const parsed = bodySchema.safeParse(await readBody(request));
		if (!parsed.success) throw new AppError("invalid", "Invalid chat message.");
		events = await startTutorChat(ctx.deps, actor, parsed.data);
	} catch (e) {
		if (e instanceof AppError) return textResponse(STATUS[e.code], e.message);
		if (e instanceof AuthError) return textResponse(401, e.message);
		console.error("[ai-tutor] tutor chat request failed", e instanceof Error ? e.message : e);
		return textResponse(500, FAILED_TEXT);
	}
	const stream = createUIMessageStream({
		execute: async ({ writer }) => {
			const id = "nova";
			writer.write({ type: "text-start", id });
			for await (const event of events) {
				if (event.text) writer.write({ type: "text-delta", id, delta: event.text });
				if (event.type !== "text") writer.write({ type: "data-notice", data: { reason: event.type }, transient: true });
			}
			writer.write({ type: "text-end", id });
		},
		onError: () => FAILED_TEXT,
	});
	return createUIMessageStreamResponse({ stream, headers: { "cache-control": "no-store" } });
}
