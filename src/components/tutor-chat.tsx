import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useState } from "react";
import { getTutorChatFn } from "#/server/functions";
import { ErrorBox, errorMessage } from "./form";

const MAX_CHARS = 500;

type StoredMessage = { id: string; role: "user" | "assistant"; text: string };

const toUIMessage = (m: StoredMessage): UIMessage => ({
	id: m.id,
	role: m.role,
	parts: [{ type: "text", text: m.text }],
});

const textOf = (m: UIMessage) =>
	m.parts
		.filter((p): p is { type: "text"; text: string } => p.type === "text")
		.map((p) => p.text)
		.join("");

export function TutorChat({ sessionId }: { sessionId: string }) {
	const [state, setState] = useState<"loading" | "off" | "ready">("loading");
	const [loadError, setLoadError] = useState<string | null>(null);
	const [draft, setDraft] = useState("");

	const transport = useMemo(
		() =>
			new DefaultChatTransport<UIMessage>({
				api: "/api/tutor-chat",
				credentials: "same-origin",
				prepareSendMessagesRequest: ({ messages }) => {
					const last = messages.at(-1);
					return { body: { sessionId, message: last ? textOf(last) : "" } };
				},
			}),
		[sessionId],
	);

	const { messages, setMessages, sendMessage, status, error, clearError } = useChat({
		id: `tutor-${sessionId}`,
		transport,
	});

	useEffect(() => {
		let cancelled = false;
		getTutorChatFn({ data: { sessionId } })
			.then((res) => {
				if (cancelled) return;
				setMessages(res.messages.map(toUIMessage));
				setState(res.enabled ? "ready" : "off");
			})
			.catch((e: unknown) => {
				if (cancelled) return;
				setLoadError(errorMessage(e));
				setState("off");
			});
		return () => {
			cancelled = true;
		};
	}, [sessionId, setMessages]);

	const busy = status === "submitted" || status === "streaming";

	const send = () => {
		const text = draft.replace(/\s+/g, " ").trim();
		if (!text || busy) return;
		clearError();
		setDraft("");
		void sendMessage({ text });
	};

	return (
		<section className="card space-y-3" data-testid="tutor-chat" aria-label="Chat with Nova">
			<div>
				<p className="meta">Ask Nova</p>
				<p className="text-sm text-soft">Stuck on an idea? Tell Nova what you think and it will help you reason.</p>
			</div>
			{state === "off" && (
				<p className="text-sm text-soft" data-testid="tutor-chat-off">
					{loadError ?? "The AI tutor is not switched on for this family."}
				</p>
			)}
			{state === "ready" && (
				<>
					{messages.length > 0 && (
						<ol className="space-y-2" aria-live="polite" data-testid="tutor-chat-log">
							{messages.map((m) => (
								<li
									key={m.id}
									className={m.role === "user" ? "ml-8 text-right text-sm" : "bubble mr-8 text-sm"}
									data-testid={m.role === "user" ? "chat-child" : "chat-nova"}
								>
									{textOf(m)}
								</li>
							))}
						</ol>
					)}
					{status === "submitted" && <p className="meta">Nova is thinking…</p>}
					<ErrorBox error={error ? error.message || "Nova could not answer just now." : null} />
					<form
						className="flex gap-2"
						onSubmit={(e) => {
							e.preventDefault();
							send();
						}}
					>
						<input
							className="input"
							aria-label="Message to Nova"
							autoComplete="off"
							maxLength={MAX_CHARS}
							value={draft}
							onChange={(e) => setDraft(e.target.value)}
						/>
						<button type="submit" className="btn" disabled={busy || !draft.trim()}>
							Send
						</button>
					</form>
				</>
			)}
		</section>
	);
}
