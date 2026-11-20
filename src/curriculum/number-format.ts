import { type Rng, shuffle } from "./rng";

export function formatNumber(n: number): string {
	const rounded = Math.round(n * 1e6) / 1e6;
	const [whole, frac] = String(rounded).split(".");
	const withCommas = (whole ?? "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
	return frac ? `${withCommas}.${frac}` : withCommas;
}

export function choicesFor(rng: Rng, answer: number, distractors: number[]): string[] {
	const unique = [...new Set(distractors.filter((d) => d !== answer && d >= 0))].slice(0, 3);
	return shuffle(rng, [answer, ...unique].map(formatNumber));
}
