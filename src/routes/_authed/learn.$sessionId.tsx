import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ConfidenceScale } from "#/components/confidence-scale";
import { FlightPlan } from "#/components/flight-plan";
import { ErrorBox, useAction } from "#/components/form";
import { flightStep } from "#/components/learning-map";
import { Nova } from "#/components/nova";
import { novaStateForLesson } from "#/components/nova-state";
import { formatDate, formatWeekday, StatusBadge } from "#/components/status";
import { askTutorFn, getSessionFn, sessionActionFn } from "#/server/functions";
import { firstSpokenNumber, questionSpeech } from "#/voice/spoken";
import { useListener, useSpeaker } from "#/voice/use-voice";

export const Route = createFileRoute("/_authed/learn/$sessionId")({
	loader: ({ params }) => getSessionFn({ data: { sessionId: params.sessionId } }),
	component: LessonPage,
});

type Session = Awaited<ReturnType<typeof getSessionFn>>;
type SessionAction =
	| { action: "answer"; response: string }
	| { action: "hint" | "continue" }
	| { action: "confidence"; moment: "before" | "after"; value: number };

const PHASE_LABEL: Record<string, string> = {
	diagnostic: "Warm-up check",
	instruction: "Learn",
	guided: "Practise together",
	independent: "Show what you know",
	review: "Review check",
	complete: "Finished",
};

function LessonPage() {
	const initial = Route.useLoaderData();
	const [session, setSession] = useState<Session>(initial);
	const [answer, setAnswer] = useState("");
	const [tutorText, setTutorText] = useState<string | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const { view } = session;
	const { confidence } = session;
	const step = flightStep(view.phase);
	const askCheckIn = confidence.before === undefined && (view.phase === "diagnostic" || view.phase === "review");
	const [heard, setHeard] = useState<{ said: string; number: string | null } | null>(null);
	const speaker = useSpeaker(session.voice);
	const listener = useListener(session.voice, (alternatives) => {
		const number = firstSpokenNumber(alternatives);
		setHeard({ said: alternatives[0] ?? "", number });
		if (number) {
			setAnswer(number);
			inputRef.current?.focus();
		}
	});
	const spokenKey = view.item ? `${view.item.id}:${view.position}` : view.phase;
	const lastSpoken = useRef<string | null>(null);
	const lastHint = useRef<string | null>(null);

	useEffect(() => setSession(initial), [initial]);
	useEffect(() => {
		if (view.item) inputRef.current?.focus();
	}, [view.item]);
	useEffect(() => {
		if (!speaker.supported || lastSpoken.current === spokenKey) return;
		lastSpoken.current = spokenKey;
		const parts = [session.feedback?.message];
		if (view.item) parts.push(questionSpeech(view.item));
		else if (view.explanation) parts.push(...view.explanation);
		else if (view.phase === "complete") parts.push("Mission complete. Well done for finishing!");
		speaker.speak(parts.filter(Boolean).join(" "));
	}, [speaker, spokenKey, session.feedback, view.item, view.explanation, view.phase]);
	useEffect(() => {
		if (!speaker.supported || !session.hint || lastHint.current === session.hint) return;
		lastHint.current = session.hint;
		speaker.speak(`Hint: ${session.hint}`);
	}, [speaker, session.hint]);

	const act = useAction(async (data: SessionAction) => {
		listener.stop();
		const next = await sessionActionFn({ data: { ...data, sessionId: session.sessionId } });
		setSession(next);
		if (data.action === "answer") {
			setAnswer("");
			setHeard(null);
		}
		if (data.action === "continue") setTutorText(null);
	});

	const tutor = useAction(async () => {
		const res = await askTutorFn({ data: { sessionId: session.sessionId } });
		setTutorText(res.available ? res.text : "The AI tutor is not switched on for this family.");
	});

	const submit = (value: string) => {
		if (!value.trim() || act.pending) return;
		void act.run({ action: "answer", response: value.trim() });
	};

	const novaState = novaStateForLesson({
		phase: view.phase,
		thinking: tutor.pending,
		feedbackCorrect: session.feedback ? session.feedback.correct : null,
		hasHint: Boolean(session.hint),
		listening: listener.status === "listening",
		speaking: speaker.speaking,
	});

	return (
		<div className="surface-space min-h-screen">
			<main className="page max-w-2xl space-y-6">
				<div className="flex items-center justify-between">
					<Link to="/students/$studentId" params={{ studentId: session.studentId }} className="link text-sm">
						← Back
					</Link>
					<span className="chip" data-testid="phase" data-phase={view.phase}>
						{PHASE_LABEL[view.phase]}
						{view.item ? ` · ${view.position}/${view.total}` : ""}
					</span>
				</div>

				{step !== null && <FlightPlan current={step} />}

				{view.phase !== "complete" && (
					<div className="flex items-center gap-4">
						<Nova state={novaState} size={160} priority className="w-28 shrink-0 sm:w-40" />
						<p className="bubble text-soft">{session.objective.statement}</p>
					</div>
				)}

				{askCheckIn && (
					<section className="card">
						<ConfidenceScale
							label="Before we start: how sure do you feel about this?"
							onChange={(value) => void act.run({ action: "confidence", moment: "before", value })}
						/>
					</section>
				)}

				{session.feedback && (
					<section
						aria-live="polite"
						data-testid="feedback"
						data-correct={session.feedback.correct}
						className={session.feedback.correct ? "note-correct" : "note-focus"}
					>
						<p className="font-semibold">{session.feedback.message}</p>
						{session.feedback.workedSolution && (
							<p className="mt-2 text-sm text-soft">{session.feedback.workedSolution}</p>
						)}
						{session.feedback.alternativeExplanation && (
							<p className="mt-2 text-sm text-soft">{session.feedback.alternativeExplanation}</p>
						)}
					</section>
				)}

				{view.phase === "instruction" && view.explanation && (
					<section className="card space-y-3" data-testid="explanation">
						{view.explanation.map((line) => (
							<p key={line} className="text-lg leading-relaxed">
								{line}
							</p>
						))}
						{tutorText && (
							<div className="bubble text-sm" data-testid="tutor-text">
								{tutorText}
							</div>
						)}
						<div className="flex flex-wrap gap-2 pt-2">
							<button
								type="button"
								className="btn"
								disabled={act.pending}
								onClick={() => void act.run({ action: "continue" })}
							>
								I'm ready to practise
							</button>
							<button type="button" className="btn-secondary" disabled={tutor.pending} onClick={() => void tutor.run()}>
								{tutor.pending ? "Thinking…" : "Explain it another way"}
							</button>
							{speaker.supported && (
								<button
									type="button"
									className="btn-secondary"
									data-testid="hear-again"
									onClick={() => speaker.speak([...(view.explanation ?? []), tutorText ?? ""].join(" "))}
								>
									Hear it again
								</button>
							)}
						</div>
						<ErrorBox error={tutor.error} />
					</section>
				)}

				{view.item && (
					<section className="card space-y-4" data-testid="question">
						<p className="font-display text-4xl leading-tight" data-testid="prompt">
							{view.item.prompt}
						</p>
						{view.item.choices ? (
							<div className="grid grid-cols-2 gap-3">
								{view.item.choices.map((c) => (
									<button
										key={c}
										type="button"
										className="answer"
										data-testid="choice"
										disabled={act.pending}
										onClick={() => submit(c)}
									>
										{c}
									</button>
								))}
							</div>
						) : (
							<form
								className="flex gap-2"
								onSubmit={(e) => {
									e.preventDefault();
									submit(answer);
								}}
							>
								<input
									ref={inputRef}
									className="input text-lg"
									inputMode="decimal"
									autoComplete="off"
									aria-label="Your answer"
									value={answer}
									maxLength={64}
									onChange={(e) => setAnswer(e.target.value)}
								/>
								<button type="submit" className="btn" disabled={act.pending || !answer.trim()}>
									Check
								</button>
							</form>
						)}
						{session.voice && (
							<VoiceControls
								item={view.item}
								speaker={speaker}
								listener={listener}
								heard={heard}
								typed={!view.item.choices}
							/>
						)}
						{view.canHint && (
							<button
								type="button"
								className="link text-sm"
								disabled={act.pending}
								onClick={() => void act.run({ action: "hint" })}
							>
								Show a hint
							</button>
						)}
						{session.hint && (
							<p className="note-hint" data-testid="hint">
								Hint: {session.hint}
							</p>
						)}
						{(view.phase === "independent" || view.phase === "review" || view.phase === "diagnostic") && (
							<p className="meta">No hints here. Just try your best.</p>
						)}
					</section>
				)}

				{view.phase === "complete" && session.result && (
					<section className="space-y-6" data-testid="result">
						<div className="grid items-center gap-6 sm:grid-cols-[1fr_auto]">
							<div className="space-y-3">
								<p className="meta">Mission complete</p>
								<h2 className="font-display text-5xl leading-none sm:text-6xl">
									Well done for <i className="text-accent">finishing!</i>
								</h2>
								<p className="text-soft">{session.objective.statement}</p>
							</div>
							<Nova state="proud" size={200} className="mx-auto" />
						</div>

						<div className="card space-y-3">
							<p className="flex flex-wrap items-center gap-2">
								<span className="text-soft">Status now:</span> <StatusBadge status={session.result.status} />
							</p>
							<ul className="space-y-2 text-sm text-soft">
								{session.result.reasons.map((r) => (
									<li key={r} className="flex gap-2">
										<span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
										{r}
									</li>
								))}
							</ul>
						</div>

						<div className="card space-y-3">
							<ConfidenceScale
								label="And now, how sure do you feel?"
								value={confidence.after}
								before={confidence.before}
								onChange={(value) => void act.run({ action: "confidence", moment: "after", value })}
							/>
							{confidence.before !== undefined && confidence.after !== undefined && (
								<p className="text-sm text-soft" data-testid="confidence-change">
									Before: {confidence.before} of 5 · Now: {confidence.after} of 5.{" "}
									{confidence.after > confidence.before
										? "Practice paid off."
										: confidence.after < confidence.before
											? "That is normal after a solo check. The review will help."
											: "Steady. The review check will show how it lasts."}
								</p>
							)}
							{confidence.before !== undefined && confidence.after === undefined && (
								<p className="text-xs text-muted">The dashed box is what you chose before the mission.</p>
							)}
						</div>

						{session.result.nextReviewAt && (
							<div className="card flex items-center gap-5">
								<p className="font-display text-5xl leading-none text-hint">
									{formatWeekday(session.result.nextReviewAt)}
								</p>
								<div>
									<p className="meta">Next review check</p>
									<p className="mt-1 text-sm">
										{formatDate(session.result.nextReviewAt)}. Pass it and this skill stays secure for longer.
									</p>
								</div>
							</div>
						)}

						<Link to="/students/$studentId" params={{ studentId: session.studentId }} className="btn">
							Back to progress
						</Link>
					</section>
				)}

				<ErrorBox error={act.error} />
			</main>
		</div>
	);
}

function VoiceControls({
	item,
	speaker,
	listener,
	heard,
	typed,
}: {
	item: { prompt: string; choices?: string[] | null };
	speaker: ReturnType<typeof useSpeaker>;
	listener: ReturnType<typeof useListener>;
	heard: { said: string; number: string | null } | null;
	typed: boolean;
}) {
	const { status } = listener;
	return (
		<div className="space-y-2" data-testid="voice-controls">
			<div className="flex flex-wrap items-center gap-2">
				{speaker.supported && (
					<button
						type="button"
						className="btn-secondary"
						data-testid="hear-again"
						onClick={() => speaker.speak(questionSpeech(item))}
					>
						Hear it again
					</button>
				)}
				{typed && status === "ready" && (
					<button
						type="button"
						className="btn-secondary"
						data-testid="say-it"
						onClick={() => {
							speaker.stop();
							listener.listen();
						}}
					>
						Say my answer
					</button>
				)}
				{typed && status === "listening" && (
					<button type="button" className="btn" data-testid="listening" onClick={listener.stop}>
						Listening… tap to stop
					</button>
				)}
				{typed && status === "downloadable" && (
					<button type="button" className="btn-secondary" onClick={() => void listener.install()}>
						Download the speech pack once
					</button>
				)}
				{typed && status === "downloading" && <span className="meta">Downloading the speech pack…</span>}
			</div>
			{typed && status === "unavailable" && (
				<p className="meta" data-testid="voice-unavailable">
					Speaking answers does not work on this device yet. Type your answer instead.
				</p>
			)}
			{heard && (
				<p className="text-sm text-soft" data-testid="heard" aria-live="polite">
					I heard “{heard.said}”.{" "}
					{heard.number
						? `That is ${heard.number}. Press Check if it is right.`
						: "I could not find a number in that. Try again or type it."}
				</p>
			)}
			{listener.error && <p className="text-sm text-soft">{listener.error}</p>}
		</div>
	);
}
