import type { PrefixWord } from "./english-bank";
import type { Generator } from "./generators";
import { pick, type Rng, shuffle } from "./rng";

const US_SPELLINGS: Record<string, string> = {
	mum: "mom",
	neighbour: "neighbor",
	neighbours: "neighbors",
	colour: "color",
	favourite: "favorite",
	centre: "center",
	grey: "gray",
};

export function usSpellingVariants(answer: string): { accept?: string[] } {
	const us = answer.replace(/[A-Za-z]+/g, (w) => {
		const v = US_SPELLINGS[w.toLowerCase()];
		if (!v) return w;
		return w[0] === w[0]?.toUpperCase() ? v[0]?.toUpperCase() + v.slice(1) : v;
	});
	return us === answer ? {} : { accept: [us] };
}

export function options(rng: Rng, answer: string, distractors: readonly string[]): string[] {
	const unique = [...new Set(distractors.filter((d) => d !== answer))].slice(0, 3);
	return shuffle(rng, [answer, ...unique]);
}

export function prefixGenerator(
	objectiveCode: string,
	bank: readonly PrefixWord[],
	rules: Record<string, string>,
	distractors: (rng: Rng, w: PrefixWord) => readonly string[],
): Generator {
	return ({ rng, difficulty, type, id }) => {
		const w = pick(rng, bank);
		const mc = type === "multiple_choice";
		return {
			id,
			objectiveCode,
			type: mc ? "multiple_choice" : "written",
			difficulty,
			prompt: mc
				? `Which word means "${w.meaning}"?`
				: `Add a prefix to "${w.root}" to make a word that means "${w.meaning}".`,
			...(mc
				? {
						choices: options(
							rng,
							w.word,
							distractors(rng, w).map((p) => `${p}${w.root}`),
						),
					}
				: {}),
			answer: w.word,
			hint: rules[w.prefix] ?? "",
			workedSolution: `${w.prefix}– + ${w.root} = ${w.word}. ${rules[w.prefix] ?? ""}`.trim(),
		};
	};
}
