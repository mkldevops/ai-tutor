import { type ReactNode, useState } from "react";
import type { ExplanationStep } from "#/learning-engine/lesson";
import { splitStep } from "./explanation-step";

type Props = {
	steps: ExplanationStep[];
	onStep: (text: string) => void;
	onReady: () => void;
	onHear?: (text: string) => void;
	readyPending: boolean;
	extras: ReactNode;
	children?: ReactNode;
};

export function ExplanationStepper({ steps, onStep, onReady, onHear, readyPending, extras, children }: Props) {
	const [index, setIndex] = useState(0);
	const step = steps[index];
	if (!step) return null;
	const last = index === steps.length - 1;
	const { lead, figures } = splitStep(step.text);
	const go = (next: number) => {
		setIndex(next);
		const text = steps[next]?.text;
		if (text) onStep(text);
	};

	return (
		<section className="card space-y-5 p-5 sm:p-6" data-testid="explanation" aria-live="polite">
			<p className="meta" data-testid="explanation-step">
				{step.reminder ? "Quick reminder · " : ""}Step {index + 1} of {steps.length}
			</p>
			<div className="min-h-40 space-y-4 sm:min-h-44">
				{figures.length > 0 && (
					<div className="space-y-1">
						{figures.map((figure) => (
							<p key={figure} className="explain-figure">
								{figure}
							</p>
						))}
					</div>
				)}
				<p className={figures.length > 0 ? "text-lg leading-relaxed text-soft" : "text-xl leading-relaxed"}>{lead}</p>
			</div>
			{children}
			<div className="flex flex-wrap items-center gap-2">
				{index > 0 && (
					<button type="button" className="btn-secondary" onClick={() => go(index - 1)}>
						Back
					</button>
				)}
				{last ? (
					<button type="button" className="btn" disabled={readyPending} onClick={onReady}>
						I'm ready to practise
					</button>
				) : (
					<button type="button" className="btn" onClick={() => go(index + 1)}>
						Next
					</button>
				)}
				<ol className="ml-auto flex gap-1.5" aria-hidden="true">
					{steps.map((s, i) => (
						<li key={s.text} className="explain-dot" data-on={i <= index || undefined} />
					))}
				</ol>
			</div>
			<div className="flex flex-wrap gap-x-4 gap-y-1 border-t pt-3 text-sm explain-extras">
				{extras}
				{onHear && (
					<button type="button" className="link" data-testid="hear-again" onClick={() => onHear(step.text)}>
						Hear it again
					</button>
				)}
			</div>
		</section>
	);
}
