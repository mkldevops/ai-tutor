import type { PlanetKind } from "./learning-map";

export function PlanetDot({ kind, className = "size-4" }: { kind: PlanetKind; className?: string }) {
	return (
		<svg viewBox="0 0 24 24" className={`shrink-0 ${className}`} aria-hidden="true">
			<g data-kind={kind} className="planet">
				<circle cx={12} cy={12} r={8} />
			</g>
		</svg>
	);
}
