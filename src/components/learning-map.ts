import type { CompetencyStatus, LessonPhase } from "#/domain/types";

export const FLIGHT_STEPS = ["Recall", "Explain", "Practise", "Solo flight"] as const;

const STEP_INDEX: Partial<Record<LessonPhase, number>> = {
	diagnostic: 0,
	instruction: 1,
	guided: 2,
	independent: 3,
	complete: FLIGHT_STEPS.length,
};

export function flightStep(phase: LessonPhase): number | null {
	return STEP_INDEX[phase] ?? null;
}

export type PlanetKind = "lasting" | "secure" | "active" | "review" | "unreached";

export const PLANET_LEGEND: { kind: PlanetKind; label: string }[] = [
	{ kind: "lasting", label: "Lasting" },
	{ kind: "secure", label: "Secure" },
	{ kind: "active", label: "In progress" },
	{ kind: "review", label: "Review due" },
	{ kind: "unreached", label: "Not reached" },
];

export function planetKind(status: CompetencyStatus, reviewDue = false): PlanetKind {
	if (reviewDue || status === "needs_review") return "review";
	if (status === "mastered") return "lasting";
	if (status === "secure") return "secure";
	if (status === "not_started") return "unreached";
	return "active";
}

export type Orbit = { rx: number; ry: number };
export const ORBITS: Orbit[] = [
	{ rx: 110, ry: 42 },
	{ rx: 180, ry: 72 },
	{ rx: 250, ry: 102 },
];

export function placePlanets(count: number): { orbit: number; x: number; y: number }[] {
	const perOrbit = ORBITS.map(() => 0);
	for (let i = 0; i < count; i++) perOrbit[i % ORBITS.length]++;
	const seen = ORBITS.map(() => 0);
	return Array.from({ length: count }, (_, i) => {
		const orbit = i % ORBITS.length;
		const j = seen[orbit]++;
		const angle = -Math.PI / 3 + orbit * 0.9 + (j * 2 * Math.PI) / perOrbit[orbit];
		const { rx, ry } = ORBITS[orbit];
		return { orbit, x: Math.round(rx * Math.cos(angle)), y: Math.round(ry * Math.sin(angle)) };
	});
}
