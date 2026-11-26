import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { getTutorChatFn } from "#/server/functions";
import { ErrorBox, errorMessage } from "./form";

const MAX_CHARS = 500;
const HELPS = ["Explain the question", "Use a smaller example", "Explain another way"];

type StoredMessage = { id: string; role: "user" | "assistant"; text: string };

type Scope = { question?: string; afterId: string | null; open: boolean };

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

const scopeKey = (sessionId: string) => `nova:${sessionId}`;

function readScope(sessionId: string): Partial<Scope> | null {
	try {
		const raw = window.sessionStorage.getItem(scopeKey(sessionId));
		return raw ? (JSON.parse(raw) as Partial<Scope>) : null;
	} catch {
		return null;
	}
}

function writeScope(sessionId: string, scope: Scope) {
	try {
		window.sessionStorage.setItem(scopeKey(sessionId), JSON.stringify(scope));
	} catch {
		// Storage can be blocked; Nova still works for this page view.
	}
}

export function latestExchange(messages: UIMessage[], afterId: string | null) {
	const start = afterId === null ? 0 : messages.findIndex((m) => m.id === afterId) + 1 || messages.length;
	const current = messages.slice(start);
	const asked = current.map((m) => m.role).lastIndexOf("user");
	return asked < 0 ? current.slice(-1) : current.slice(asked, asked + 2);
}

export function TutorChat({ sessionId, question }: { sessionId: string; question?: string }) {
	const panelId = useId();
	const draftInput = useRef<HTMLInputElement>(null);
	const [expanded, setExpanded] = useState(true);
	const [scope, setScope] = useState<Scope | null>(null);
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

	const currentQuestion = useRef(question);
	currentQuestion.current = question;
	useEffect(() => {
		const stored = readScope(sessionId);
		if (stored?.open === false) setExpanded(false);
		let cancelled = false;
		getTutorChatFn({ data: { sessionId } })
			.then((res) => {
				if (cancelled) return;
				const loaded = res.messages.map(toUIMessage);
				const question = currentQuestion.current;
				const sameQuestion = stored?.question === question && stored?.afterId !== undefined;
				setMessages(loaded);
				setScope({
					question,
					afterId: sameQuestion ? (stored?.afterId ?? null) : (loaded.at(-1)?.id ?? null),
					open: stored?.open ?? true,
				});
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

	const lastId = messages.at(-1)?.id ?? null;
	const lastIdRef = useRef(lastId);
	lastIdRef.current = lastId;
	useEffect(() => {
		setScope((current) =>
			current && current.question !== question ? { ...current, question, afterId: lastIdRef.current } : current,
		);
	}, [question]);

	useEffect(() => {
		if (scope) writeScope(sessionId, { ...scope, open: expanded });
	}, [sessionId, scope, expanded]);

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
	const exchange = scope ? latestExchange(messages, scope.afterId) : [];
	const asked = exchange.find((m) => m.role === "user");
	const reply = exchange.find((m) => m.role === "assistant");

	const send = (help?: string) => {
		const text = (help ?? draft).replace(/\s+/g, " ").trim();
		if (!text || busy) return;
		clearError();
		if (!help) setDraft("");
		void sendMessage({ text });
	};

	return (
		<section className="card space-y-4" data-testid="tutor-chat" aria-label="Chat with Nova">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div>
					<p className="meta">Ask Nova</p>
					<p className="text-sm text-soft">
						{expanded ? "Stuck? Pick how Nova can help." : "Nova is here if you get stuck."}
					</p>
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
			<div id={panelId} hidden={!expanded} className="space-y-4">
				{question && (
					<p className="sr-only" data-testid="tutor-current-question">
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
						<fieldset className="flex flex-wrap gap-2" aria-label="Ways Nova can help">
							{HELPS.map((help) => (
								<button key={help} type="button" className="btn-secondary" disabled={busy} onClick={() => send(help)}>
									{help}
								</button>
							))}
						</fieldset>
						{exchange.length > 0 && (
							<div className="space-y-2" aria-live="polite" data-testid="tutor-chat-log">
								{asked && (
									<p className="meta" data-testid="chat-child">
										{textOf(asked)}
									</p>
								)}
								{reply && (
									<p className="bubble text-base leading-relaxed" data-testid="chat-nova">
										{textOf(reply)}
									</p>
								)}
							</div>
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
								placeholder="Or ask your own question"
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
