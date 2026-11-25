import { useEffect, useId, useRef, useState } from "react";
import {
	conceptForObjective,
	formatMotionNumber,
	type MotionConcept,
	type MotionExample,
	motionStep,
	motionTravel,
	placeNames,
	placeShortNames,
	practiceFeedback,
	roundingState,
} from "./concept-motion-data";
import { createCaptionNarrator, type MotionNarrationCallbacks } from "./concept-motion-narration";
import "./concept-motion.css";

export type ConceptMotionProps = { objectiveCode: string; compact?: boolean } & MotionNarrationCallbacks;

/** Public objective metadata only; examples never inspect a pending lesson question. */
export function ConceptMotion({ objectiveCode, compact = false, onNarrate, onPauseNarration }: ConceptMotionProps) {
	const concept = conceptForObjective(objectiveCode);
	return concept ? (
		<MotionLesson
			key={objectiveCode}
			concept={concept}
			compact={compact}
			onNarrate={onNarrate}
			onPauseNarration={onPauseNarration}
		/>
	) : null;
}

function MotionDiagram({ example, position, gentle }: { example: MotionExample; position: number; gentle: boolean }) {
	const step = motionStep(position);
	const travel = motionTravel(position, gentle);
	if (example.kind === "digits") {
		const first = Math.min(...example.start, ...example.end, 3);
		const last = Math.max(...example.start, ...example.end, 4);
		const width = (last - first + 1) * 100 + 40;
		const x = (column: number) => 70 + (column - first) * 100;
		const finalText = example.result;
		const decimal = finalText.includes(".") ? finalText.indexOf(".") : finalText.length;
		const finalDigits = finalText.replace(".", "").split("");
		return (
			<svg viewBox={`0 0 ${width} 250`} aria-hidden="true" focusable="false">
				{placeNames.map(
					(name, column) =>
						column >= first &&
						column <= last && (
							<g key={name}>
								<rect x={x(column) - 48} y="65" width="96" height="120" rx="8" className="cm-column" />
								<text x={x(column)} y="30" textAnchor="middle" className="cm-place-name">
									{name}
								</text>
								<text x={x(column)} y="51" textAnchor="middle" className="cm-place-value">
									{placeShortNames[column]}
								</text>
							</g>
						),
				)}
				<line x1={x(3) + 50} x2={x(3) + 50} y1="63" y2="196" className="cm-decimal-line" />
				<circle cx={x(3) + 50} cy="148" r="5" className="cm-amber" />
				{example.digits.map((digit, index) => (
					<g
						key={`${example.start[index]}-${digit}`}
						transform={`translate(${x(example.start[index]) + (example.end[index] - example.start[index]) * 100 * travel}, ${125 - (gentle ? 0 : Math.sin(travel * Math.PI) * 24)})`}
					>
						<rect x="-30" y="-34" width="60" height="68" rx="12" className="cm-tile" />
						<text textAnchor="middle" y="16" className="cm-digit">
							{digit}
						</text>
					</g>
				))}
				{step === 3 &&
					finalDigits.map((digit, index) => {
						const column = 4 - decimal + index;
						return !example.end.includes(column) && digit === "0" ? (
							<text key={column} x={x(column)} y="141" textAnchor="middle" className="cm-zero">
								0
							</text>
						) : null;
					})}
				<text x={width / 2} y="225" textAnchor="middle" className="cm-svg-note">
					Decimal point stays between ones and tenths
				</text>
			</svg>
		);
	}
	if (example.kind === "round") {
		const state = roundingState(example.value, example.unit);
		const start = 85 + state.fraction * 430;
		const target = state.result === state.low ? 85 : 515;
		const resolve = gentle ? Number(step === 3) : Math.max(0, Math.min(1, (position - 0.75) * 4));
		const marker = start + (target - start) * resolve;
		const fmt = formatMotionNumber;
		return (
			<svg viewBox="0 0 600 250" aria-hidden="true" focusable="false">
				<line x1="85" x2="515" y1="135" y2="135" className="cm-number-line" />
				{[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((tick) => (
					<line
						key={tick}
						x1={85 + tick * 43}
						x2={85 + tick * 43}
						y1={tick % 5 === 0 ? 124 : 130}
						y2="146"
						className="cm-tick"
					/>
				))}
				{step >= 1 && (
					<>
						<text x="85" y="180" textAnchor="middle" className="cm-neighbour">
							{fmt(state.low)}
						</text>
						<text x="515" y="180" textAnchor="middle" className="cm-neighbour">
							{fmt(state.high)}
						</text>
						<text x="300" y="180" textAnchor="middle" className="cm-svg-note">
							halfway
						</text>
					</>
				)}
				{step === 2 && (
					<>
						<path d={`M85 115 Q${(85 + start) / 2} 55 ${start} 115`} className="cm-distance" />
						<path d={`M${start} 115 Q${(515 + start) / 2} 55 515 115`} className="cm-distance" />
						<text x={(85 + start) / 2} y="65" textAnchor="middle" className="cm-svg-note">
							{state.distanceLow} away
						</text>
						<text x={(515 + start) / 2} y="65" textAnchor="middle" className="cm-svg-note">
							{state.distanceHigh} away
						</text>
					</>
				)}
				<circle cx={marker} cy="135" r="9" className="cm-amber" />
				<text x={marker} y={step === 2 ? 35 : 95} textAnchor="middle" className="cm-number-label">
					{fmt(resolve === 1 ? state.result : example.value)}
				</text>
				{step === 3 && (
					<text x="300" y="230" textAnchor="middle" className="cm-round-result">
						{fmt(state.result).slice(0, -(String(example.unit).length - 1))}
						<tspan className="cm-mint-text">{"0".repeat(String(example.unit).length - 1)}</tspan>
					</text>
				)}
			</svg>
		);
	}
	const stem = step >= 1 ? example.stem : example.base;
	const prefix = example.position === "prefix";
	const left = prefix ? example.affix : stem;
	const right = prefix ? stem : example.affix;
	const leftWidth = left.length * 26 + 28;
	const rightWidth = right.length * 26 + 28;
	const gap = 55 * (1 - travel);
	const leftX = (600 - leftWidth - rightWidth - gap) / 2;
	const rightX = leftX + leftWidth + gap;
	return (
		<svg viewBox="0 0 600 250" aria-hidden="true" focusable="false">
			<g
				opacity={prefix && step === 0 ? 0 : 1}
				transform={`translate(${leftX}, ${95 - (gentle ? 0 : Math.sin(travel * Math.PI) * 20)})`}
			>
				<rect width={leftWidth} height="70" rx="12" className={prefix ? "cm-tile" : "cm-base-tile"} />
				<text x={leftWidth / 2} y="48" textAnchor="middle" className="cm-word">
					{left}
				</text>
				{step < 2 && (
					<text x={leftWidth / 2} y="-17" textAnchor="middle" className="cm-svg-note">
						{prefix ? "prefix" : "base"}
					</text>
				)}
			</g>
			<g opacity={!prefix && step === 0 ? 0 : 1} transform={`translate(${rightX}, 95)`}>
				<rect width={rightWidth} height="70" rx="12" className={prefix ? "cm-base-tile" : "cm-tile"} />
				<text x={rightWidth / 2} y="48" textAnchor="middle" className="cm-word">
					{right}
				</text>
				{step < 2 && (
					<text x={rightWidth / 2} y="-17" textAnchor="middle" className="cm-svg-note">
						{prefix ? "base verb" : "suffix"}
					</text>
				)}
			</g>
			{step === 3 && (
				<text x="300" y="220" textAnchor="middle" className="cm-svg-note">
					{example.meaning}
				</text>
			)}
		</svg>
	);
}

function MotionLesson({
	concept,
	compact,
	onNarrate,
	onPauseNarration,
}: { concept: MotionConcept; compact: boolean } & MotionNarrationCallbacks) {
	const callbacks = useRef<MotionNarrationCallbacks>({ onNarrate, onPauseNarration });
	const [narrator] = useState(() => createCaptionNarrator(() => callbacks.current));
	useEffect(() => {
		if (callbacks.current.onNarrate && !onNarrate) callbacks.current.onPauseNarration?.();
		callbacks.current = { onNarrate, onPauseNarration };
	}, [onNarrate, onPauseNarration]);
	useEffect(() => () => narrator.stop(), [narrator]);
	const [open, setOpen] = useState(!compact);
	const [exampleIndex, setExampleIndex] = useState(0);
	const [position, setPosition] = useState(0);
	const progress = useRef(0);
	const [playing, setPlaying] = useState(false);
	const [speed, setSpeed] = useState(1);
	const [systemReduced, setSystemReduced] = useState(false);
	const [gentleChoice, setGentleChoice] = useState(false);
	const [choice, setChoice] = useState<string | null>(null);
	const [showMethod, setShowMethod] = useState(false);
	const id = useId();
	const example = concept.examples[exampleIndex];
	const step = motionStep(position);
	const gentle = systemReduced || gentleChoice;
	const seek = (next: number) => {
		narrator.stop();
		setPlaying(false);
		progress.current = Math.max(0, Math.min(1, next));
		setPosition(progress.current);
	};

	useEffect(() => {
		const query = window.matchMedia("(prefers-reduced-motion: reduce)");
		const update = () => {
			narrator.stop();
			setSystemReduced(query.matches);
			setPlaying(false);
		};
		setSystemReduced(query.matches);
		query.addEventListener("change", update);
		const hide = () => {
			if (document.hidden) {
				narrator.stop();
				setPlaying(false);
			}
		};
		document.addEventListener("visibilitychange", hide);
		return () => {
			query.removeEventListener("change", update);
			document.removeEventListener("visibilitychange", hide);
		};
	}, [narrator]);

	useEffect(() => {
		if (!playing || !open) return;
		let frame = 0;
		let last: number | null = null;
		const tick = (now: number) => {
			if (document.hidden) {
				narrator.stop();
				setPlaying(false);
				return;
			}
			if (last !== null) progress.current = Math.min(1, progress.current + (Math.min(now - last, 100) * speed) / 20000);
			last = now;
			setPosition(progress.current);
			if (progress.current >= 1) {
				setPlaying(false);
				return;
			}
			frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	}, [playing, open, speed, narrator]);

	return (
		<section className="concept-motion" data-testid="concept-motion" aria-label="Animated teaching example">
			<button
				className="cm-disclosure"
				type="button"
				aria-expanded={open}
				aria-controls={`${id}-body`}
				onClick={() => {
					narrator.stop();
					setPlaying(false);
					setOpen(!open);
				}}
			>
				<span aria-hidden="true">✦</span> {open ? "Animated example · your pace, your way" : "See an animated example"}
				<span aria-hidden="true">{open ? "−" : "+"}</span>
			</button>
			<div id={`${id}-body`} hidden={!open} className="cm-body">
				{open && (
					<>
						<p className="cm-eyebrow">Explore together · no score</p>
						<h3>{concept.title}</h3>
						<p className="cm-intro">These are teaching examples. Pause, replay or try a step whenever you like.</p>
						<label className="cm-example-label">
							Choose an example
							<select
								data-testid="motion-example"
								value={exampleIndex}
								onChange={(event) => {
									seek(0);
									setExampleIndex(Number(event.target.value));
								}}
							>
								{concept.examples.map((item, index) => (
									<option key={item.label} value={index}>
										{item.label}
									</option>
								))}
							</select>
						</label>
						<div className="cm-stage">
							<MotionDiagram example={example} position={position} gentle={gentle} />
						</div>
						<output className="cm-caption" aria-atomic="true">
							<span className="cm-step-label">
								Step {step + 1} of 4 · {concept.steps[step]}
							</span>
							<span className="cm-caption-text">{example.captions[step]}</span>
						</output>
						{onNarrate && (
							<div className="cm-controls">
								<button
									type="button"
									data-testid="motion-narrate"
									onClick={() => {
										setPlaying(false);
										narrator.hear(example.captions[step]);
									}}
								>
									Hear this step
								</button>
								{onPauseNarration && (
									<button type="button" data-testid="motion-stop-narration" onClick={() => narrator.stop()}>
										Stop voice
									</button>
								)}
								<p className="cm-intro">Listening pauses the animation, so you can hear the whole step.</p>
							</div>
						)}
						<div className="cm-controls">
							<button
								type="button"
								data-testid="motion-play"
								className="cm-primary"
								onClick={() => {
									narrator.stop();
									if (position >= 1) {
										progress.current = 0;
										setPosition(0);
									}
									setPlaying(!playing);
								}}
							>
								{playing ? "Pause" : position >= 1 ? "Replay" : "Play"}
							</button>
							<button type="button" onClick={() => seek(0)}>
								Restart
							</button>
							<button type="button" disabled={position === 0} onClick={() => seek(step === 0 ? 0 : (step - 1) / 4)}>
								Previous step
							</button>
							<button type="button" disabled={position >= 1} onClick={() => seek(step === 3 ? 1 : (step + 1) / 4)}>
								Next step
							</button>
							<label>
								Speed
								<select
									aria-label="Playback speed"
									value={speed}
									onChange={(event) => setSpeed(Number(event.target.value))}
								>
									<option value="0.75">0.75×</option>
									<option value="1">1×</option>
									<option value="1.25">1.25×</option>
								</select>
							</label>
						</div>
						<label className="cm-timeline">
							Explore the timeline
							<input
								data-testid="motion-timeline"
								type="range"
								min="0"
								max="1000"
								step="1"
								value={Math.round(position * 1000)}
								aria-valuetext={`Step ${step + 1} of 4: ${concept.steps[step]}`}
								onChange={(event) => seek(Number(event.target.value) / 1000)}
							/>
						</label>
						<ol className="cm-steps">
							{concept.steps.map((name, index) => (
								<li key={name}>
									<button
										type="button"
										aria-current={step === index ? "step" : undefined}
										onClick={() => seek(index / 4)}
									>
										<span>{index + 1}</span>
										{name}
									</button>
								</li>
							))}
						</ol>
						<label className="cm-gentle">
							<input
								type="checkbox"
								checked={gentle}
								disabled={systemReduced}
								onChange={(event) => {
									narrator.stop();
									setGentleChoice(event.target.checked);
									setPlaying(false);
								}}
							/>
							Gentle motion · show one clear state at a time{systemReduced ? " (device preference)" : ""}
						</label>
						<details
							className="cm-practice"
							data-testid="motion-practice"
							onToggle={() => {
								narrator.stop();
								setPlaying(false);
							}}
						>
							<summary>Try one together · no score</summary>
							<p>{concept.practice.question}</p>
							<div className="cm-choices">
								{concept.practice.choices.map((answer) => (
									<button
										type="button"
										key={answer}
										aria-pressed={choice === answer}
										onClick={() => {
											narrator.stop();
											setPlaying(false);
											setChoice(answer);
											setShowMethod(false);
										}}
									>
										{answer}
									</button>
								))}
							</div>
							<output aria-atomic="true" className="cm-feedback">
								{choice ? practiceFeedback(concept.practice, choice) : "Choose an answer. We can work it out together."}
							</output>
							<button
								type="button"
								aria-expanded={showMethod}
								aria-controls={`${id}-method`}
								onClick={() => setShowMethod(!showMethod)}
							>
								{showMethod ? "Hide the method" : "Show the method"}
							</button>
							<p id={`${id}-method`} hidden={!showMethod}>
								{concept.practice.method}
							</p>
						</details>
					</>
				)}
			</div>
		</section>
	);
}
