import { type ReactNode, useEffect, useRef } from "react";
import type { Feedback } from "#/learning-engine/lesson";

export const CELEBRATE_MS = 1800;

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

function Celebrate({ message, onNext }: { message: string; onNext: () => void }) {
	const next = useRef(onNext);
	next.current = onNext;
	useEffect(() => {
		const timer = setTimeout(() => next.current(), CELEBRATE_MS);
		return () => clearTimeout(timer);
	}, []);

	return (
		<section
			className="note-correct celebrate space-y-3 text-center"
			aria-live="polite"
			data-testid="feedback"
			data-correct="true"
		>
			<p className="font-display text-5xl leading-none font-bold sm:text-6xl">Bravo!</p>
			<p className="text-lg text-soft">{message}</p>
			<div className="celebrate-track" aria-hidden="true">
				<div className="celebrate-bar" style={{ animationDuration: `${CELEBRATE_MS}ms` }} />
			</div>
			<button type="button" className="link text-sm" onClick={onNext}>
				Next question now
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
	return (
		<section className="card space-y-5 p-5 sm:p-6" aria-live="polite" data-testid="feedback" data-correct="false">
			<p className="note-focus font-semibold">{feedback.message}</p>
			{feedback.question && <p className="font-display text-4xl leading-tight">{feedback.question}</p>}
			{(feedback.yourAnswer || feedback.correctAnswer) && (
				<dl className="grid grid-cols-2 gap-3">
					{feedback.yourAnswer && (
						<div className="answer-review" data-kind="yours">
							<dt className="meta">You answered</dt>
							<dd className="font-display text-3xl line-through" data-testid="your-answer">
								{feedback.yourAnswer}
							</dd>
						</div>
					)}
					{feedback.correctAnswer && (
						<div className="answer-review" data-kind="right">
							<dt className="meta">Right answer</dt>
							<dd className="font-display text-3xl" data-testid="correct-answer">
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
				<button type="button" className="btn" onClick={onNext} data-testid="understood">
					I understand, next question
				</button>
				{extras}
			</div>
		</section>
	);
}
