import { formatNumber } from "#/curriculum/generators";
import { type NumberLine as Line, promptParts } from "./missing-number";

export function PromptText({ prompt }: { prompt: string }) {
	return (
		<>
			{promptParts(prompt).map((part, i) =>
				part.blank ? (
					// biome-ignore lint/suspicious/noArrayIndexKey: parts are static for a prompt
					<span key={i} className="blank-slot" role="img" aria-label="missing number">
						?
					</span>
				) : (
					// biome-ignore lint/suspicious/noArrayIndexKey: parts are static for a prompt
					<span key={i}>{part.text}</span>
				),
			)}
		</>
	);
}

const WIDTH = 600;
const PAD = 36;
const AXIS_Y = 40;

export function NumberLine({ line }: { line: Line }) {
	const gaps = (line.to - line.from) / line.step;
	const x = (value: number) => PAD + ((value - line.from) / (line.to - line.from)) * (WIDTH - PAD * 2);
	const ticks = Array.from({ length: gaps + 1 }, (_, i) => line.from + i * line.step);
	return (
		<svg
			className="number-line"
			viewBox={`0 0 ${WIDTH} 80`}
			role="img"
			aria-label={`Number line from ${formatNumber(line.from)} to ${formatNumber(line.to)} with ${line.marks
				.map(formatNumber)
				.join(" and ")} marked`}
			data-testid="number-line"
		>
			<line x1={PAD - 16} x2={WIDTH - PAD + 16} y1={AXIS_Y} y2={AXIS_Y} className="number-line__axis" />
			{ticks.map((t) => {
				const major = (Math.abs(t - line.start) / line.step) % 5 === 0;
				return (
					<line
						key={t}
						x1={x(t)}
						x2={x(t)}
						y1={AXIS_Y - (major ? 10 : 6)}
						y2={AXIS_Y + (major ? 10 : 6)}
						className="number-line__tick"
					/>
				);
			})}
			{line.marks.map((m) => (
				<g key={m}>
					<circle cx={x(m)} cy={AXIS_Y} r={6} className="number-line__mark" />
					<text x={x(m)} y={AXIS_Y + 32} textAnchor="middle" className="number-line__label">
						{formatNumber(m)}
					</text>
				</g>
			))}
		</svg>
	);
}
