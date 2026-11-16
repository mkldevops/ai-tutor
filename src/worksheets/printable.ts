import { createRng, generateItem, hashSeed, supportedTypes } from "#/curriculum/generators";
import type { CompetencyStatus, Item, ItemType } from "#/domain/types";

export type Difficulty = 1 | 2 | 3;

export type PrintableItem = {
	number: number;
	type: ItemType;
	prompt: string;
	choices: string[] | null;
	answer: string;
	workedSolution: string;
};

export const BLANK_LINE = "______";
export const LETTERS = ["a", "b", "c", "d"];

export function difficultyFor(status: CompetencyStatus): Difficulty {
	if (status === "secure" || status === "mastered") return 3;
	if (status === "developing" || status === "needs_review") return 2;
	return 1;
}

export function toPaperPrompt(item: Pick<Item, "type" | "prompt">): string {
	if (item.type === "word_problem") return item.prompt;
	return item.prompt.replace(/\?\s*$/, BLANK_LINE).replace(/☐/g, BLANK_LINE);
}

export function buildPrintableItems(input: {
	objectiveCode: string;
	difficulty: Difficulty;
	count: number;
	seed: string;
}): PrintableItem[] {
	const rng = createRng(hashSeed(`${input.seed}:${input.objectiveCode}:${input.difficulty}`));
	const types = supportedTypes(input.objectiveCode);
	const items: Item[] = [];
	const seen = new Set<string>();
	for (let attempt = 0; items.length < input.count && attempt < input.count * 20; attempt++) {
		const item = generateItem(input.objectiveCode, {
			rng,
			difficulty: input.difficulty,
			type: types[items.length % types.length],
			id: `print-${items.length}`,
		});
		const key = item.workedSolution.split(". ")[0] ?? item.prompt;
		if (seen.has(key)) continue;
		seen.add(key);
		items.push(item);
	}
	return items.map((item, i) => {
		const letter = item.choices ? LETTERS[item.choices.indexOf(item.answer)] : undefined;
		return {
			number: i + 1,
			type: item.type,
			prompt: toPaperPrompt(item),
			choices: item.choices ?? null,
			answer: letter ? `${letter}) ${item.answer}` : item.answer,
			workedSolution: item.workedSolution,
		};
	});
}
