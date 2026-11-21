import type { CompetencyStatus } from "#/domain/types";
import { ORBITS, PLANET_LEGEND, type PlanetKind, placePlanets, planetKind } from "./learning-map";

type Skill = { code: string; statement: string; status: CompetencyStatus; reviewDue?: boolean };

const CX = 280;
const CY = 140;

export function OrbitMap({ core, skills }: { core: string; skills: Skill[] }) {
	const planets = placePlanets(skills.length);
	const counts = new Map<PlanetKind, number>();
	const kinds = skills.map((s) => {
		const kind = planetKind(s.status, s.reviewDue);
		counts.set(kind, (counts.get(kind) ?? 0) + 1);
		return kind;
	});
	const summary = PLANET_LEGEND.filter((l) => counts.get(l.kind))
		.map((l) => `${counts.get(l.kind)} ${l.label.toLowerCase()}`)
		.join(", ");

	return (
		<figure className="space-y-4" data-testid="orbit-map">
			<svg
				viewBox="0 28 560 224"
				className="mx-auto h-auto w-full max-w-[560px]"
				role="img"
				aria-label={`Orbit map of ${core}: ${summary}`}
			>
				{ORBITS.map((o) => (
					<ellipse key={o.rx} cx={CX} cy={CY} rx={o.rx} ry={o.ry} className="orbit-path" />
				))}
				<circle cx={CX} cy={CY} r={34} className="orbit-core" />
				<text x={CX} y={CY + 5} textAnchor="middle" className="orbit-core-label">
					{core}
				</text>
				{skills.map((s, i) => (
					<g key={s.code} data-kind={kinds[i]} className="planet">
						<title>{s.statement}</title>
						<circle cx={CX + planets[i].x} cy={CY + planets[i].y} r={15} />
					</g>
				))}
			</svg>
			<figcaption>
				<ul className="flex flex-wrap gap-x-5 gap-y-2" aria-label="Legend">
					{PLANET_LEGEND.map((l) => (
						<li key={l.kind} className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-soft">
							<PlanetDot kind={l.kind} />
							{l.label}
						</li>
					))}
				</ul>
			</figcaption>
		</figure>
	);
}

export function PlanetDot({ kind, className = "size-4" }: { kind: PlanetKind; className?: string }) {
	return (
		<svg viewBox="0 0 24 24" className={`shrink-0 ${className}`} aria-hidden="true">
			<g data-kind={kind} className="planet">
				<circle cx={12} cy={12} r={8} />
			</g>
		</svg>
	);
}
