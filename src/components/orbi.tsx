import { useId } from "react";
import { ORBI_COLOR, ORBI_LABEL, type OrbiState } from "./orbi-state";

export type { OrbiState } from "./orbi-state";

type OrbiProps = {
	state?: OrbiState;
	size?: number;
	animated?: boolean;
	label?: string;
	className?: string;
};

export function Orbi({ state = "ready", size = 160, animated = true, label, className }: OrbiProps) {
	const id = useId().replace(/[^a-zA-Z0-9]/g, "");
	const color = ORBI_COLOR[state];
	const solo = state === "solo";
	const shell = `url(#${id}shell)`;
	const ringOpacity = solo ? 0.25 : 1;

	return (
		<svg
			viewBox="0 0 420 340"
			width={size}
			height={(size * 340) / 420}
			role="img"
			aria-label={label ?? ORBI_LABEL[state]}
			data-orbi-state={state}
			className={className}
		>
			<defs>
				<radialGradient id={`${id}shell`} cx="0.35" cy="0.25" r="0.9">
					<stop offset="0" stopColor="#FFFFFF" />
					<stop offset="0.6" stopColor="#E6E8EF" />
					<stop offset="1" stopColor="#9DA3B8" />
				</radialGradient>
				<linearGradient id={`${id}face`} x1="0" y1="0" x2="0" y2="1">
					<stop offset="0" stopColor={solo ? "#11131F" : "#23263A"} />
					<stop offset="1" stopColor="#04050B" />
				</linearGradient>
				<radialGradient id={`${id}halo`}>
					<stop offset="0" stopColor={color} stopOpacity={solo ? 0 : 0.26} />
					<stop offset="1" stopColor={color} stopOpacity="0" />
				</radialGradient>
				<filter id={`${id}glow`} x="-50%" y="-50%" width="200%" height="200%">
					<feGaussianBlur stdDeviation="3" result="b" />
					<feMerge>
						<feMergeNode in="b" />
						<feMergeNode in="SourceGraphic" />
					</feMerge>
				</filter>
			</defs>
			<circle cx="210" cy="160" r="160" fill={`url(#${id}halo)`} />
			<path
				d="M30 200 A185 52 -14 0 1 390 110"
				fill="none"
				stroke={color}
				strokeOpacity={0.35 * ringOpacity}
				strokeWidth="2"
			/>
			<g className={animated ? "animate-orbi-float" : undefined}>
				<path d="M154 220 Q210 200 266 220 Q274 276 210 300 Q146 276 154 220 Z" fill={shell} />
				<circle cx="210" cy="262" r="9" fill="#0D1330" />
				<circle cx="210" cy="262" r="4.5" fill={color} />
				<ellipse cx="136" cy="246" rx="14" ry="30" fill={shell} transform="rotate(-20 136 246)" />
				{state === "proud" ? (
					<ellipse cx="300" cy="184" rx="14" ry="34" fill={shell} transform="rotate(32 300 184)" />
				) : (
					<ellipse cx="284" cy="246" rx="14" ry="30" fill={shell} transform="rotate(20 284 246)" />
				)}
				<rect x="110" y="38" width="200" height="170" rx="80" fill={shell} />
				<rect x="99" y="104" width="16" height="40" rx="8" fill="#C9CDD9" />
				<rect x="305" y="104" width="16" height="40" rx="8" fill="#C9CDD9" />
				<rect x="130" y="68" width="160" height="112" rx="52" fill={`url(#${id}face)`} />
				<path
					d="M148 88 Q184 74 224 78"
					stroke="#FFFFFF"
					strokeOpacity="0.22"
					strokeWidth="6"
					fill="none"
					strokeLinecap="round"
				/>
				<OrbiEyes state={state} color={color} glow={`url(#${id}glow)`} animated={animated} />
			</g>
			<path
				d="M30 200 A185 52 -14 0 0 390 110"
				fill="none"
				stroke={color}
				strokeOpacity={ringOpacity}
				strokeWidth="2.5"
			/>
			{!solo && <circle cx="372" cy="122" r="7" fill="#FFB547" />}
		</svg>
	);
}

function OrbiEyes({
	state,
	color,
	glow,
	animated,
}: {
	state: OrbiState;
	color: string;
	glow: string;
	animated: boolean;
}) {
	switch (state) {
		case "thinking":
			return (
				<g filter={glow} fill={color}>
					<rect x="176" y="94" width="20" height="24" rx="9" />
					<rect x="240" y="94" width="20" height="24" rx="9" />
					<rect x="186" y="150" width="12" height="6" rx="3" />
					<rect x="204" y="150" width="12" height="6" rx="3" opacity="0.6" />
					<rect x="222" y="150" width="12" height="6" rx="3" opacity="0.3" />
				</g>
			);
		case "hint":
			return (
				<g filter={glow} fill={color}>
					<rect x="166" y="110" width="22" height="34" rx="11" />
					<path d="M228 106 Q243 90 260 100" stroke={color} strokeWidth="7" fill="none" strokeLinecap="round" />
					<rect x="232" y="116" width="22" height="26" rx="11" />
				</g>
			);
		case "correct":
		case "proud":
			return (
				<g filter={glow} stroke={color} strokeWidth="9" fill="none" strokeLinecap="round">
					<path d="M162 134 Q177 110 192 134" />
					<path d="M228 134 Q243 110 258 134" />
				</g>
			);
		case "notQuite":
			return (
				<g filter={glow} fill={color}>
					<rect x="160" y="120" width="34" height="13" rx="6.5" />
					<rect x="226" y="120" width="34" height="13" rx="6.5" />
					<path d="M160 106 L192 112 M260 106 L228 112" stroke={color} strokeWidth="5" strokeLinecap="round" />
				</g>
			);
		case "solo":
			return (
				<g fill={color} opacity="0.7">
					<rect x="164" y="122" width="28" height="5" rx="2.5" />
					<rect x="228" y="122" width="28" height="5" rx="2.5" />
				</g>
			);
		default:
			return (
				<g
					filter={glow}
					fill={color}
					className={animated ? "animate-orbi-blink" : undefined}
					style={{ transformBox: "fill-box", transformOrigin: "center" }}
				>
					<rect x="166" y="108" width="22" height="36" rx="11" />
					<rect x="232" y="108" width="22" height="36" rx="11" />
				</g>
			);
	}
}
