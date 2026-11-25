import { type ReactNode, useEffect, useRef } from "react";
import type { Feedback } from "#/learning-engine/lesson";

export const SAVED_MS = 1000;

type Props = {
	feedback: Feedback;
	onNext: () => void;
	extras?: ReactNode;
	children?: ReactNode;
};

export function AnswerFeedback({ feedback, onNext, extras, children }: Props) {
	return feedback.correct ? (
		<Celebrate message={feedback.message} onNext={onNext} />
	) : (
		<Explain feedback={feedback} onNext={onNext} extras={extras}>
			{children}
		</Explain>
	);
}

function useAutoNext(onNext: () => void, ms: number) {
	const next = useRef(onNext);
	next.current = onNext;
	useEffect(() => {
		const timer = setTimeout(() => next.current(), ms);
		return () => clearTimeout(timer);
	}, [ms]);
}

export function AnswerSaved({ onNext }: { onNext: () => void }) {
	useAutoNext(onNext, SAVED_MS);
	return (
		<section className="card saved space-y-3 text-center" aria-live="polite" data-testid="answer-saved">
			<span aria-hidden="true" className="saved-check">
				✓
			</span>
			<p className="font-display text-2xl">Answer saved</p>
			<div className="celebrate-track" aria-hidden="true">
				<div className="celebrate-bar" style={{ animationDuration: `${SAVED_MS}ms` }} />
			</div>
		</section>
	);
}

function Celebrate({ message, onNext }: { message: string; onNext: () => void }) {
	const next = useRef<HTMLButtonElement>(null);
	useEffect(() => next.current?.focus({ preventScroll: true }), []);

	return (
		<section
			className="note-correct celebrate space-y-3 text-center"
			aria-live="polite"
			data-testid="feedback"
			data-correct="true"
		>
			<p className="font-display text-5xl leading-none font-bold sm:text-6xl">Bravo!</p>
			<p className="text-lg text-soft">{message}</p>
			<button ref={next} type="button" className="btn min-h-11" onClick={onNext} data-testid="feedback-continue">
				Continue
			</button>
		</section>
	);
}

function Explain({
	feedback,
	onNext,
	extras,
	children,
}: {
	feedback: Feedback;
	onNext: () => void;
	extras?: ReactNode;
	children?: ReactNode;
}) {
	const understood = useRef<HTMLButtonElement>(null);
	useEffect(() => {
		understood.current?.focus({ preventScroll: true });
	}, []);

	return (
		<section className="card space-y-5 p-5 sm:p-6" aria-live="polite" data-testid="feedback" data-correct="false">
			<div className="space-y-2">
				<p className="font-display text-2xl">Let's take a look together</p>
				<p className="text-soft">{feedback.message}</p>
				<p className="text-sm text-soft">Compare the answers, then read the steps. Continue when you are ready.</p>
			</div>
			{feedback.question && <p className="font-display text-4xl leading-tight">{feedback.question}</p>}
			{(feedback.yourAnswer || feedback.correctAnswer) && (
				<dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
					{feedback.yourAnswer && (
						<div className="answer-review" data-kind="yours">
							<dt className="meta">You answered</dt>
							<dd className="font-display text-3xl wrap-anywhere" data-testid="your-answer">
								{feedback.yourAnswer}
							</dd>
						</div>
					)}
					{feedback.correctAnswer && (
						<div className="answer-review" data-kind="right">
							<dt className="meta">Right answer</dt>
							<dd className="font-display text-3xl wrap-anywhere" data-testid="correct-answer">
								{feedback.correctAnswer}
							</dd>
						</div>
					)}
				</dl>
			)}
			{feedback.workedSolution && (
				<div className="space-y-1">
					<p className="meta">How it works</p>
					<p className="text-lg leading-relaxed">{feedback.workedSolution}</p>
				</div>
			)}
			{feedback.hint && <p className="note-hint">Tip for next time: {feedback.hint}</p>}
			{feedback.alternativeExplanation && (
				<div className="space-y-1">
					<p className="meta">Another way to see it</p>
					<p className="text-soft leading-relaxed">{feedback.alternativeExplanation}</p>
				</div>
			)}
			{children}
			<div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-4 explain-extras">
				<button ref={understood} type="button" className="btn" onClick={onNext} data-testid="understood">
					Continue
				</button>
				{extras}
			</div>
		</section>
	);
}
