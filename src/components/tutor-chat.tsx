import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useId, useMemo, useRef, useState } from "react";
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

export function TutorChat({ sessionId, question }: { sessionId: string; question?: string }) {
	const panelId = useId();
	const draftInput = useRef<HTMLInputElement>(null);
	const [expanded, setExpanded] = useState(true);
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

	const { messages, setMessages, sendMessage, status, error, clearError, stop } = useChat({
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

	const previousQuestion = useRef(question);
	useEffect(() => {
		if (previousQuestion.current !== question) void stop();
		previousQuestion.current = question;
	}, [question, stop]);
	useEffect(
		() => () => {
			void stop();
		},
		[stop],
	);

	const busy = status === "submitted" || status === "streaming";

	const send = (help?: string) => {
		const text = (help ?? draft).replace(/\s+/g, " ").trim();
		if (!text || busy) return;
		clearError();
		if (!help) setDraft("");
		void sendMessage({ text });
	};

	return (
		<section className="card space-y-3" data-testid="tutor-chat" aria-label="Chat with Nova">
			<div className="flex flex-wrap items-start justify-between gap-2">
				<div>
					<p className="meta">Ask Nova</p>
					<p className="text-sm text-soft">Stuck on an idea? Choose how Nova can help, or continue on your own.</p>
				</div>
				<button
					type="button"
					className="btn-secondary"
					aria-expanded={expanded}
					aria-controls={panelId}
					onClick={() => {
						if (expanded) void stop();
						setExpanded(!expanded);
					}}
				>
					{expanded ? "Hide Nova · Continue alone" : "Open Nova"}
				</button>
			</div>
			<div id={panelId} hidden={!expanded} className="space-y-3">
				{question && (
					<p className="text-sm text-soft" data-testid="tutor-current-question">
						Current question: {question}
					</p>
				)}
				{state === "off" && (
					<p className="text-sm text-soft" data-testid="tutor-chat-off">
						{loadError ?? "The AI tutor is not switched on for this family."}
					</p>
				)}
				{state === "ready" && (
					<>
						{messages.length > 0 && (
							<ol
								className="max-h-64 space-y-2 overflow-y-auto overscroll-contain"
								// biome-ignore lint/a11y/noNoninteractiveTabindex: Scrollable history must support keyboard scrolling.
								tabIndex={0}
								aria-label="Conversation with Nova"
								aria-live="polite"
								data-testid="tutor-chat-log"
							>
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
						{busy && (
							<button
								type="button"
								className="btn-secondary"
								onClick={() => {
									void stop().then(() => draftInput.current?.focus());
								}}
							>
								Stop generating
							</button>
						)}
						<fieldset className="flex flex-wrap gap-2" aria-label="Ways Nova can help">
							{["Explain the question", "Use a smaller example", "Explain another way"].map((help) => (
								<button key={help} type="button" className="btn-secondary" disabled={busy} onClick={() => send(help)}>
									{help}
								</button>
							))}
						</fieldset>
						<ErrorBox error={error ? error.message || "Nova could not answer just now." : null} />
						<form
							className="flex gap-2"
							onSubmit={(e) => {
								e.preventDefault();
								send();
							}}
						>
							<input
								ref={draftInput}
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
			</div>
		</section>
	);
}
