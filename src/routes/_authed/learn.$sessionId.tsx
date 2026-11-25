import { createFileRoute, Link } from "@tanstack/react-router";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { AnswerFeedback, AnswerSaved } from "#/components/answer-feedback";
import { ConceptMotion } from "#/components/concept-motion";
import { ConfidenceScale } from "#/components/confidence-scale";
import { ExplanationStepper } from "#/components/explanation-stepper";
import { FlightPlan } from "#/components/flight-plan";
import { ErrorBox, useAction } from "#/components/form";
import { flightStep } from "#/components/learning-map";
import { answerFormat, LessonSummary, PHASE_SUPPORT } from "#/components/lesson-support";
import { BLANK, numberLineFor } from "#/components/missing-number";
import { NumberLine, PromptText } from "#/components/missing-number-view";
import { Confetti, RateConfidence } from "#/components/mission-complete";
import { Nova } from "#/components/nova";
import { novaStateForLesson } from "#/components/nova-state";
import { formatDate, formatWeekday, StatusBadge } from "#/components/status";
import { TutorChat } from "#/components/tutor-chat";
import type { Feedback } from "#/learning-engine/lesson";
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
	const [gate, setGate] = useState<Feedback | null>(null);
	const [saved, setSaved] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);
	const choicesRef = useRef<HTMLFieldSetElement>(null);
	const { view } = session;
	const { confidence } = session;
	const extra = view.kind === "extra";
	const step = extra ? null : flightStep(gate ? "guided" : view.phase);
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
		if (!view.item || gate || saved) return;
		if (choicesRef.current) choicesRef.current.querySelector("button")?.focus();
		else inputRef.current?.focus();
	}, [view.item, gate, saved]);
	useEffect(() => {
		const key = gate ? `feedback:${spokenKey}` : spokenKey;
		if (!speaker.supported || saved || lastSpoken.current === key) return;
		lastSpoken.current = key;
		const parts: (string | undefined)[] = [];
		if (gate) parts.push(gate.correct ? `Bravo! ${gate.message}` : `${gate.message} ${gate.workedSolution ?? ""}`);
		else if (view.item) parts.push(questionSpeech(view.item));
		else if (view.explanationSteps?.[0]) parts.push(view.explanationSteps[0].text);
		else if (view.phase === "complete")
			parts.push(extra ? "Extra practice done. Well done!" : "Mission complete. Well done for finishing!");
		speaker.speak(parts.filter(Boolean).join(" "));
	}, [speaker, spokenKey, gate, saved, view.item, view.explanationSteps, view.phase, extra]);
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
			setGate(next.feedback);
			setSaved(!next.feedback && next.view.item !== null);
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

	const hintLine = session.hint && view.item ? numberLineFor(view.item.prompt) : null;

	const novaState = novaStateForLesson({
		phase: view.phase,
		thinking: tutor.pending,
		feedbackCorrect: gate ? gate.correct : null,
		hasHint: Boolean(session.hint),
		listening: listener.status === "listening",
		speaking: speaker.speaking,
	});

	return (
		<div className="surface-space min-h-screen">
			<main className="page max-w-2xl space-y-6">
				<div className="flex items-center justify-between">
					<Link
						to="/students/$studentId"
						params={{ studentId: session.studentId }}
						className="link inline-flex min-h-11 items-center text-sm"
						data-testid="lesson-break"
						aria-disabled={act.pending}
						onClick={(event) => {
							if (act.pending) event.preventDefault();
							else {
								speaker.stop();
								listener.stop();
							}
						}}
					>
						{view.phase === "complete" ? "← Back to missions" : "← Take a break"}
					</Link>
					<span className="chip" data-testid="phase" data-phase={view.phase}>
						{gate ? "Your feedback" : extra && view.phase !== "complete" ? "Extra practice" : PHASE_LABEL[view.phase]}
						{view.item && !gate ? ` · ${view.position}/${view.total}` : ""}
					</span>
				</div>
				{view.phase !== "complete" && (
					<p className="text-xs text-muted" data-testid="break-reassurance">
						Checked answers are saved. Return from your missions to carry on.
						{answer.trim() && " An answer you have not checked is not saved yet."}
					</p>
				)}

				{step !== null && <FlightPlan current={step} />}

				{view.phase !== "complete" && (
					<div className="flex items-center gap-4">
						<Nova state={novaState} size={160} priority className="w-28 shrink-0 sm:w-40" />
						<div className="bubble">
							<p className="meta">Today's mission</p>
							<p
								className="mt-1 font-display text-2xl leading-tight font-bold sm:text-3xl"
								data-testid="objective-title"
							>
								{session.objective.title}
							</p>
							<p className="mt-3 text-sm text-soft" data-testid="phase-support">
								{gate ? "Take a moment with your feedback. You choose when to continue." : PHASE_SUPPORT[view.phase]}
							</p>
						</div>
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

				{gate && (
					<AnswerFeedback
						key={spokenKey}
						feedback={gate}
						onNext={() => {
							setGate(null);
							setTutorText(null);
						}}
						extras={
							<>
								{view.phase === "guided" && (
									<button
										type="button"
										className="link min-h-11"
										disabled={tutor.pending}
										onClick={() => void tutor.run()}
									>
										{tutor.pending ? "Thinking…" : "Explain it another way"}
									</button>
								)}
								{speaker.supported && (
									<button
										type="button"
										className="link min-h-11"
										onClick={() =>
											speaker.speak([gate.message, gate.workedSolution, tutorText].filter(Boolean).join(" "))
										}
									>
										Hear it again
									</button>
								)}
							</>
						}
					>
						{tutorText && (
							<div className="bubble text-sm" data-testid="tutor-text">
								{tutorText}
							</div>
						)}
						<ErrorBox error={tutor.error} />
					</AnswerFeedback>
				)}

				{view.phase === "instruction" && (
					<ConceptMotion
						objectiveCode={session.objective.code}
						onNarrate={session.voice && speaker.supported ? speaker.speak : undefined}
						onPauseNarration={session.voice && speaker.supported ? speaker.stop : undefined}
					/>
				)}

				{view.phase === "instruction" && view.explanationSteps && view.explanationSteps.length > 0 && (
					<ExplanationStepper
						key={`explain:${session.sessionId}`}
						steps={view.explanationSteps}
						onStep={speaker.speak}
						onReady={() => void act.run({ action: "continue" })}
						readyPending={act.pending}
						onHear={speaker.supported ? (text) => speaker.speak([text, tutorText ?? ""].join(" ")) : undefined}
						extras={
							<button type="button" className="link min-h-11" disabled={tutor.pending} onClick={() => void tutor.run()}>
								{tutor.pending ? "Thinking…" : "Explain it another way"}
							</button>
						}
					>
						{tutorText && (
							<div className="bubble text-sm" data-testid="tutor-text">
								{tutorText}
							</div>
						)}
						<ErrorBox error={tutor.error} />
					</ExplanationStepper>
				)}

				{saved && <AnswerSaved key={spokenKey} onNext={() => setSaved(false)} />}

				{view.item && !gate && !saved && (
					<section className="card space-y-4" data-testid="question">
						{view.item.prompt.includes(BLANK) && <p className="meta">Find the missing number</p>}
						<p className="font-display text-4xl leading-tight" data-testid="prompt" data-prompt={view.item.prompt}>
							<PromptText prompt={view.item.prompt} />
						</p>
						<p id="answer-format" className="text-sm text-soft" data-testid="answer-format">
							{answerFormat(view.item)}
						</p>
						{view.item.choices ? (
							<fieldset
								ref={choicesRef}
								className="grid min-w-0 grid-cols-2 gap-3"
								aria-label="Answer choices"
								aria-describedby="answer-format"
								onKeyDown={moveChoiceFocus}
							>
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
							</fieldset>
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
									{...(view.item.type === "written"
										? { inputMode: "text", spellCheck: false, autoCorrect: "off", autoCapitalize: "off" }
										: { inputMode: "decimal" })}
									autoComplete="off"
									aria-label="Your answer"
									aria-describedby="answer-format"
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
								className="link min-h-11 text-sm"
								disabled={act.pending}
								onClick={() => void act.run({ action: "hint" })}
							>
								Show a hint
							</button>
						)}
						{session.hint && (
							<div className="note-hint" data-testid="hint">
								<p>Hint: {session.hint}</p>
								{hintLine && <NumberLine line={hintLine} />}
							</div>
						)}
						{(view.phase === "independent" || view.phase === "review" || view.phase === "diagnostic") && (
							<p className="meta">Your answers are saved. We will look at them after the check.</p>
						)}
					</section>
				)}

				{view.phase === "guided" && !gate && !saved && (
					<ConceptMotion
						objectiveCode={session.objective.code}
						compact
						onNarrate={session.voice && speaker.supported ? speaker.speak : undefined}
						onPauseNarration={session.voice && speaker.supported ? speaker.stop : undefined}
					/>
				)}

				{(view.phase === "instruction" || view.phase === "guided") && !gate && !saved && (
					<TutorChat key={`chat:${session.sessionId}`} sessionId={session.sessionId} question={view.item?.prompt} />
				)}

				{view.phase === "complete" && !gate && extra && (
					<section className="space-y-6" data-testid="extra-result">
						<div className="grid items-center gap-6 sm:grid-cols-[1fr_auto]">
							<div className="space-y-3">
								<p className="meta">Extra practice done</p>
								<h2 className="font-display text-5xl leading-none sm:text-6xl">
									Nice <i className="text-accent">practice!</i>
								</h2>
								<p className="text-soft">{session.objective.statement}</p>
							</div>
							<Nova state="proud" size={200} className="mx-auto" />
						</div>
						<p className="card text-sm text-soft">
							Extra practice keeps skills fresh. It does not change the course: the next mission is still waiting.
						</p>
						<Link to="/students/$studentId" params={{ studentId: session.studentId }} className="btn">
							Back to missions
						</Link>
					</section>
				)}

				{view.phase === "complete" && !gate && !extra && session.result && (
					<section className="space-y-6" data-testid="result">
						<Confetti />
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

						<LessonSummary title={session.objective.title} status={session.result.status} />
						<details className="card space-y-3">
							<summary className="min-h-11 cursor-pointer py-3 text-sm">Check details</summary>
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
						</details>

						<RateConfidence
							before={confidence.before}
							after={confidence.after}
							onRate={(value) => void act.run({ action: "confidence", moment: "after", value })}
						/>

						{session.result.nextReviewAt && (
							<div className="card flex items-center gap-5">
								<p className="font-display text-5xl leading-none text-hint">
									{formatWeekday(session.result.nextReviewAt)}
								</p>
								<div>
									<p className="meta">Next review check</p>
									<p className="mt-1 text-sm">
										{formatDate(session.result.nextReviewAt)}. A short check to see what you remember then.
									</p>
								</div>
							</div>
						)}

						<Link to="/students/$studentId" params={{ studentId: session.studentId }} className="btn">
							Back to course
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

const CHOICE_STEPS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -2, ArrowDown: 2 };

function moveChoiceFocus(e: KeyboardEvent<HTMLFieldSetElement>) {
	const step = CHOICE_STEPS[e.key];
	if (!step) return;
	const buttons = [...e.currentTarget.querySelectorAll("button")];
	const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
	if (current < 0) return;
	e.preventDefault();
	const count = buttons.length;
	buttons[(((current + step) % count) + count) % count]?.focus();
}
