const NUMBER = String.raw`(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?`;
const EQUATION = new RegExp(String.raw`${NUMBER}(?:\s*[+\-−×÷]\s*${NUMBER})+\s*=\s*${NUMBER}`, "g");
const TRAILING = new RegExp(String.raw`^(.*\S)\s*:\s*(${EQUATION.source})\.?$`);

export type StepParts = { lead: string; figures: string[] };

export function splitStep(text: string): StepParts {
	const trimmed = text.trim();
	const trailing = TRAILING.exec(trimmed);
	if (trailing?.[1] && trailing[2]) return { lead: `${trailing[1]}.`, figures: [trailing[2]] };
	return { lead: trimmed, figures: trimmed.match(EQUATION) ?? [] };
}
