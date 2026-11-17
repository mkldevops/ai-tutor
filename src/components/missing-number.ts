export const BLANK = "☐";

export type PromptPart = { blank: false; text: string } | { blank: true };

export function promptParts(prompt: string): PromptPart[] {
	return prompt
		.split(BLANK)
		.flatMap((text, i): PromptPart[] => [...(i > 0 ? [{ blank: true } as const] : []), { blank: false, text }])
		.filter((p) => p.blank || p.text !== "");
}

export type NumberLine = { from: number; to: number; step: number; start: number; marks: number[] };

const MAX_GAPS = 20;
const ADD_SUB = /^\s*([\d,]+)\s*([+−-])\s*☐\s*=\s*([\d,]+)\s*$/;

export function numberLineFor(prompt: string): NumberLine | null {
	const match = ADD_SUB.exec(prompt);
	if (!match) return null;
	const start = Number(match[1]?.replaceAll(",", ""));
	const end = Number(match[3]?.replaceAll(",", ""));
	const diff = Math.abs(end - start);
	if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || diff === 0) return null;
	let step = 1;
	while (diff / step > MAX_GAPS && diff % (step * 10) === 0) step *= 10;
	if (diff / step > MAX_GAPS) return null;
	const low = Math.min(start, end);
	const high = Math.max(start, end);
	const from = low - step >= 0 ? low - step : low;
	const to = high + step;
	return { from, to, step, start, marks: [start, end] };
}
