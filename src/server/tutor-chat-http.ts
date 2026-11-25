import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { z } from "zod";
import { AuthError } from "./auth/provider";
import { checkRequestSize } from "./request-size";
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
	paused: 409,
	off_programme: 409,
	parent_locked: 403,
};

const textResponse = (status: number, message: string) =>
	new Response(message, {
		status,
		headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
	});

class BodyRejected extends Error {
	constructor(readonly response: Response) {
		super("Request body rejected.");
	}
}

async function readBody(request: Request): Promise<unknown> {
	const rejected = checkRequestSize(request, MAX_BODY_BYTES);
	if (rejected) throw new BodyRejected(rejected);
	if (!request.headers.get("content-type")?.includes("application/json")) {
		throw new AppError("invalid", "Expected JSON.");
	}
	const raw = await request.text();
	if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
		throw new BodyRejected(new Response("Payload Too Large", { status: 413 }));
	}
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
	const controller = new AbortController();
	const abort = () => controller.abort(request.signal.reason);
	request.signal.addEventListener("abort", abort, { once: true });
	if (request.signal.aborted) abort();
	const detach = () => request.signal.removeEventListener("abort", abort);
	let events: AsyncIterable<{ type: string; text: string }>;
	try {
		const { actor } = await ctx.requireActor();
		const parsed = bodySchema.safeParse(await readBody(request));
		if (!parsed.success) throw new AppError("invalid", "Invalid chat message.");
		events = await startTutorChat(ctx.deps, actor, parsed.data, controller.signal);
	} catch (e) {
		detach();
		if (e instanceof BodyRejected) return e.response;
		if (e instanceof AppError) return textResponse(STATUS[e.code], e.message);
		if (e instanceof AuthError) return textResponse(401, e.message);
		if (controller.signal.aborted) return new Response(null, { status: 499 });
		console.error("[ai-tutor] tutor chat request failed", e instanceof Error ? e.message : e);
		return textResponse(500, FAILED_TEXT);
	}
	const stream = createUIMessageStream({
		execute: async ({ writer }) => {
			try {
				const id = "nova";
				writer.write({ type: "text-start", id });
				for await (const event of events) {
					if (controller.signal.aborted) break;
					if (event.text) writer.write({ type: "text-delta", id, delta: event.text });
					if (event.type !== "text")
						writer.write({ type: "data-notice", data: { reason: event.type }, transient: true });
				}
				writer.write({ type: "text-end", id });
			} finally {
				detach();
			}
		},
		onError: () => (controller.signal.aborted ? "" : FAILED_TEXT),
	});
	const response = createUIMessageStreamResponse({ stream, headers: { "cache-control": "no-store" } });
	if (!response.body) {
		controller.abort();
		detach();
		return response;
	}
	const reader = response.body.getReader();
	let cancelled = false;
	// Cancelling the SDK's custom execute loop alone does not stop its producer.
	// Observe cancellation at the actual response body and abort the service/model first.
	const body = new ReadableStream<Uint8Array>(
		{
			async pull(output) {
				try {
					const part = await reader.read();
					if (cancelled) return;
					if (part.done) {
						reader.releaseLock();
						output.close();
					} else {
						output.enqueue(part.value);
					}
				} catch (error) {
					controller.abort(error);
					detach();
					reader.releaseLock();
					if (!cancelled) output.error(error);
				}
			},
			async cancel(reason) {
				cancelled = true;
				controller.abort(reason);
				detach();
				try {
					await reader.cancel(reason);
				} finally {
					reader.releaseLock();
				}
			},
		},
		{ highWaterMark: 0 },
	);
	return new Response(body, { status: response.status, headers: response.headers });
}
