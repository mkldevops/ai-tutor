import { type CSSProperties, useEffect, useState } from "react";
import { ConfidenceScale } from "#/components/confidence-scale";

export const THANKS_MS = 3000;

const PIECES = Array.from({ length: 56 }, (_, i) => i);
const COLORS = ["var(--color-accent)", "var(--color-hint)", "var(--color-focus)", "var(--color-star)", "#8b7bff"];

export function Confetti() {
	return (
		<div className="confetti" aria-hidden="true" data-testid="confetti">
			{PIECES.map((i) => (
				<span
					key={i}
					data-shape={i % 3}
					style={
						{
							"--x": `${(i * 37) % 100}%`,
							"--delay": `${(i % 14) * 60}ms`,
							"--drift": `${((i * 53) % 160) - 80}px`,
							"--spin": `${((i * 97) % 900) - 450}deg`,
							"--dur": `${2400 + ((i * 131) % 1600)}ms`,
							background: COLORS[i % COLORS.length],
						} as CSSProperties
					}
				/>
			))}
		</div>
	);
}

type Props = {
	before?: number;
	after?: number;
	onRate: (value: number) => void;
};

export function RateConfidence({ before, after, onRate }: Props) {
	const [stage, setStage] = useState<"ask" | "thanks" | "done">(after === undefined ? "ask" : "done");

	useEffect(() => {
		if (after !== undefined) setStage((s) => (s === "ask" ? "thanks" : s));
	}, [after]);

	useEffect(() => {
		if (stage !== "thanks") return;
		const timer = setTimeout(() => setStage("done"), THANKS_MS);
		return () => clearTimeout(timer);
	}, [stage]);

	if (stage === "done") {
		return after === undefined ? null : <ConfidenceChange before={before} after={after} className="thanks-summary" />;
	}

	if (stage === "thanks" && after !== undefined) {
		return (
			<section className="card thanks space-y-3 text-center" aria-live="polite" data-testid="confidence-thanks">
				<span aria-hidden="true" className="thanks-badge">
					★
				</span>
				<p className="font-display text-3xl">Thanks for rating!</p>
				<p className="text-sm text-soft">It helps Nova plan your next mission.</p>
				<ConfidenceChange before={before} after={after} />
				<div className="celebrate-track" aria-hidden="true">
					<div className="celebrate-bar" style={{ animationDuration: `${THANKS_MS}ms` }} />
				</div>
			</section>
		);
	}

	return (
		<div className="card space-y-3">
			<ConfidenceScale label="And now, how sure do you feel?" value={after} before={before} onChange={onRate} />
			{before !== undefined && (
				<p className="text-xs text-muted">The dashed box is what you chose before the mission.</p>
			)}
		</div>
	);
}

function ConfidenceChange({ before, after, className }: { before?: number; after: number; className?: string }) {
	if (before === undefined) return null;
	const verdict =
		after > before
			? "Practice paid off."
			: after < before
				? "That is normal after a solo check. The review will help."
				: "Steady. The review check will show how it lasts.";
	return (
		<p className={`text-sm text-soft ${className ?? ""}`} data-testid="confidence-change">
			Before: {before} of 5 · Now: {after} of 5. {verdict}
		</p>
	);
}
