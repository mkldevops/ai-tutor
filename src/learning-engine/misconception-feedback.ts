import { formatNumber } from "#/curriculum/number-format";
import type { Item } from "#/domain/types";
import { normaliseNumeric } from "./grading";

type Support = { message: string; workedSolution: string };

/** Only used after a marked guided answer. These are observations, not diagnoses. */
export function misconceptionFeedback(item: Item, response: string): Support | null {
	const expected = normaliseNumeric(item.answer);
	const given = normaliseNumeric(response);
	if (expected === null || (given !== null && Math.abs(given - expected) < 1e-9)) return null;

	if (item.objectiveCode === "MA-Y5-PV-ROUND") {
		const value = normaliseNumeric(item.prompt.match(/[\d,]+/)?.[0] ?? "");
		const unit = normaliseNumeric(item.prompt.match(/nearest ([\d,]+)/)?.[1] ?? "");
		if (value === null || unit === null || ![10, 100, 1000, 10000, 100000].includes(unit)) return null;
		if (Math.round(value / unit) * unit !== expected) return null;
		const low = Math.floor(value / unit) * unit;
		const high = low + unit;
		const zeroCount = Math.log10(unit);
		const endingOnly =
			given !== null && given >= 0 && expected >= 1000 && given < 1000 && String(expected).endsWith(String(given));
		const message = endingOnly
			? "Keep the whole number, including the thousands. An ending on its own is not the rounded number."
			: given !== null && given % unit !== 0
				? `A number rounded to the nearest ${formatNumber(unit)} ends in ${zeroCount === 1 ? "a zero" : `${zeroCount} zeros`}. Keep the higher place values too.`
				: "Find the two neighbouring numbers first, then choose the closer one.";
		return {
			message,
			workedSolution: `${formatNumber(value)} is between ${formatNumber(low)} and ${formatNumber(high)}. It is ${formatNumber(value - low)} away from ${formatNumber(low)} and ${formatNumber(high - value)} away from ${formatNumber(high)}. ${value - low === high - value ? "It is halfway, so round up." : `The closer number is ${formatNumber(expected)}.`} Write the whole rounded number: ${formatNumber(expected)}.`,
		};
	}

	if (!["MA-Y5-MD-POWERS10", "MA-Y4-FR-DIV10-100"].includes(item.objectiveCode)) return null;
	if (item.type === "missing_number") return null;
	// Use the verified generator's equation; word problems do not contain an operator.
	const equation = item.workedSolution.match(/^([\d,.]+) ([×÷]) ([\d,]+) =/);
	if (!equation) return null;
	const value = normaliseNumeric(equation[1]);
	const factor = normaliseNumeric(equation[3]);
	if (value === null || value <= 0 || factor === null || ![10, 100, 1000].includes(factor)) return null;
	const multiply = equation[2] === "×";
	if (Math.abs((multiply ? value * factor : value / factor) - expected) > 1e-9) return null;
	const places = Math.log10(factor);
	const direction = multiply ? "left" : "right";
	const count = `${places === 1 ? "one place" : `${places} places`} to the ${direction}`;
	const missingPoint =
		given !== null && expected > 0 && expected < 1 && given === Number(String(expected).replace(".", ""));
	const wrongDirection = given !== null && (multiply ? given < value : given > value);
	return {
		message: missingPoint
			? `The decimal point changes the value: ${formatNumber(given)} and ${formatNumber(expected)} are different numbers.`
			: wrongDirection
				? `${multiply ? "Multiplying" : "Dividing"} by ${formatNumber(factor)} makes this positive number ${multiply ? "bigger" : "smaller"}. Check the direction first.`
				: `Count the places: ${equation[2]} ${formatNumber(factor)} moves every digit ${count}.`,
		workedSolution: `Start with ${formatNumber(value)}. Move every digit ${count}; the decimal point stays fixed. ${item.workedSolution.split(". The digits")[0]}${item.workedSolution.includes(". The digits") ? "." : ""}`,
	};
}
