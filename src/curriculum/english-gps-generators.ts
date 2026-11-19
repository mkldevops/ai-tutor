import type { ItemType } from "#/domain/types";
import {
	ADVERBIAL_KINDS,
	ARTICLE_PHRASES,
	FRONTED_ADVERBIALS,
	frontedSentence,
	HOMOPHONE_SENTENCES,
	LINK_SENTENCES,
	misplacedParenthesis,
	NOUN_PREFIX_RULES,
	NOUN_PREFIX_WORDS,
	NOUN_PREFIXES,
	PARENTHESIS_MARKS,
	PARENTHESIS_SENTENCES,
	SUFFIX_VERBS,
	suffixVerb,
	VERB_SUFFIXES,
	WORD_FAMILIES,
	withParenthesis,
	wrongArticle,
} from "./english-gps-bank";
import { options, prefixGenerator } from "./english-helpers";
import type { Generator } from "./generators";
import { pick, shuffle } from "./rng";

const ENGLISH_TYPES: ItemType[] = ["multiple_choice", "written"];

const kind = (type: ItemType): ItemType => (type === "multiple_choice" ? "multiple_choice" : "written");

const y3AOrAn: Generator = ({ rng, difficulty, type, id }) => {
	const p = pick(rng, ARTICLE_PHRASES);
	const base = {
		id,
		objectiveCode: "EN-Y3-GR-A-AN",
		type: kind(type),
		difficulty,
		hint: "Say the next word out loud. Use an before a vowel sound (a, e, i, o, u) and a before a consonant sound.",
		workedSolution: `"${p.noun}" starts with ${p.article === "an" ? "a vowel" : "a consonant"}, so it is "${p.article} ${p.noun}".`,
	};
	if (type === "multiple_choice") {
		const answer = `${p.article} ${p.noun}`;
		const others = shuffle(
			rng,
			ARTICLE_PHRASES.filter((x) => x.noun !== p.noun),
		)
			.slice(0, 3)
			.map((x) => `${wrongArticle(x)} ${x.noun}`);
		return { ...base, prompt: "Which phrase is written correctly?", choices: options(rng, answer, others), answer };
	}
	return { ...base, prompt: `Write a or an to complete: _____ ${p.noun}`, answer: p.article };
};

const y3Conjunctions: Generator = ({ rng, difficulty, type, id }) => {
	const s = pick(rng, LINK_SENTENCES);
	const choices = options(rng, s.answer, s.distractors);
	const mc = type === "multiple_choice";
	return {
		id,
		objectiveCode: "EN-Y3-GR-CONJUNCTIONS",
		type: kind(type),
		difficulty,
		prompt: mc
			? `Which word or phrase fits best? ${s.sentence}`
			: `Write the best word or phrase (${choices.join(", ")}): ${s.sentence}`,
		...(mc ? { choices } : {}),
		answer: s.answer,
		hint: "Does the gap need to show when, where or why something happens?",
		workedSolution: `${s.sentence.replace("_____", s.answer)} "${s.answer}" links the ideas correctly.`,
	};
};

const y3NounPrefixes = prefixGenerator("EN-Y3-SP-NOUN-PREFIXES", NOUN_PREFIX_WORDS, NOUN_PREFIX_RULES, (rng, w) =>
	shuffle(
		rng,
		NOUN_PREFIXES.filter((p) => p !== w.prefix),
	),
);

const y3WordFamilies: Generator = ({ rng, difficulty, type, id }) => {
	const f = pick(rng, WORD_FAMILIES);
	const m = pick(rng, f.members);
	const mc = type === "multiple_choice";
	return {
		id,
		objectiveCode: "EN-Y3-SP-WORD-FAMILIES",
		type: kind(type),
		difficulty,
		prompt: mc
			? `Which word is in the same word family as "${f.root}"?`
			: `Write the word from the same family as "${f.root}" that means "${m.meaning}".`,
		...(mc ? { choices: options(rng, m.word, f.lookalikes) } : {}),
		answer: m.word,
		hint: `Words in a family share a root word and a meaning. Look for "${f.root}" inside the word.`,
		workedSolution: `"${m.word}" means ${m.meaning}. It is related to "${f.root}" in form and meaning.`,
	};
};

const y5VerbSuffixes: Generator = ({ rng, difficulty, type, id }) => {
	const v = pick(rng, SUFFIX_VERBS);
	const answer = suffixVerb(v);
	const mc = type === "multiple_choice";
	return {
		id,
		objectiveCode: "EN-Y5-SP-VERB-SUFFIXES",
		type: kind(type),
		difficulty,
		prompt: mc
			? `Which verb is made from the ${v.kind} "${v.root}"?`
			: `Turn the ${v.kind} "${v.root}" into a verb using –ise, –ify or –ate.`,
		...(mc
			? {
					choices: options(
						rng,
						answer,
						VERB_SUFFIXES.filter((s) => s !== v.suffix).map((s) => `${v.stem}${s}`),
					),
				}
			: {}),
		answer,
		hint: v.rule ?? "Add the suffix straight onto the word. Use the British spelling –ise.",
		workedSolution: `${v.root} + –${v.suffix} = ${answer}.${v.rule ? ` ${v.rule}` : ""}`,
	};
};

const y5Parenthesis: Generator = ({ rng, difficulty, type, id }) => {
	const p = pick(rng, PARENTHESIS_SENTENCES);
	const mark = difficulty === 1 ? "brackets" : pick(rng, PARENTHESIS_MARKS);
	const correct = withParenthesis(p, mark);
	const base = {
		id,
		objectiveCode: "EN-Y5-PU-PARENTHESIS",
		type: kind(type),
		difficulty,
		hint: "Parenthesis is extra information. The sentence still makes sense if you take it out.",
		workedSolution: `"${p.extra}" is extra information: ${correct} Without it: ${p.before} ${p.after}`,
	};
	if (type === "multiple_choice") {
		return {
			...base,
			prompt: `Which sentence uses ${mark} correctly to show parenthesis?`,
			choices: options(rng, correct, misplacedParenthesis(p, mark)),
			answer: correct,
		};
	}
	return { ...base, prompt: `Write the words in parenthesis in this sentence: ${correct}`, answer: p.extra };
};

const y5Adverbials: Generator = ({ rng, difficulty, type, id }) => {
	const a = pick(rng, FRONTED_ADVERBIALS);
	const sentence = frontedSentence(a);
	const mc = type === "multiple_choice";
	return {
		id,
		objectiveCode: "EN-Y5-GR-ADVERBIALS",
		type: kind(type),
		difficulty,
		prompt: mc
			? `Does the fronted adverbial show time, place or number? ${sentence}`
			: `Write the fronted adverbial in this sentence: ${sentence}`,
		...(mc ? { choices: shuffle(rng, [...ADVERBIAL_KINDS]) } : {}),
		answer: mc ? a.kind : a.adverbial,
		hint: "A fronted adverbial comes at the start of the sentence and is followed by a comma.",
		workedSolution: `"${a.adverbial}" is the fronted adverbial. It tells you ${a.kind === "time" ? "when" : a.kind === "place" ? "where" : "the order (number)"}.`,
	};
};

const y5Homophones: Generator = ({ rng, difficulty, type, id }) => {
	const h = pick(rng, HOMOPHONE_SENTENCES);
	const mc = type === "multiple_choice";
	const pair = shuffle(rng, [h.answer, h.confusable]);
	return {
		id,
		objectiveCode: "EN-Y5-SP-HOMOPHONES",
		type: kind(type),
		difficulty,
		prompt: mc ? `Which word fits? ${h.sentence}` : `Write the correct word (${pair[0]} or ${pair[1]}): ${h.sentence}`,
		...(mc ? { choices: options(rng, h.answer, [h.confusable, h.extra]) } : {}),
		answer: h.answer,
		hint: `"${h.answer}" and "${h.confusable}" sound alike but mean different things. Which meaning fits?`,
		workedSolution: `${h.sentence.replace("_____", h.answer)} "${h.confusable}" sounds the same but means something else.`,
	};
};

export const ENGLISH_GPS_GENERATORS: Record<string, { gen: Generator; types: ItemType[] }> = {
	"EN-Y3-GR-A-AN": { gen: y3AOrAn, types: ENGLISH_TYPES },
	"EN-Y3-GR-CONJUNCTIONS": { gen: y3Conjunctions, types: ENGLISH_TYPES },
	"EN-Y3-SP-NOUN-PREFIXES": { gen: y3NounPrefixes, types: ENGLISH_TYPES },
	"EN-Y3-SP-WORD-FAMILIES": { gen: y3WordFamilies, types: ENGLISH_TYPES },
	"EN-Y5-SP-VERB-SUFFIXES": { gen: y5VerbSuffixes, types: ENGLISH_TYPES },
	"EN-Y5-PU-PARENTHESIS": { gen: y5Parenthesis, types: ENGLISH_TYPES },
	"EN-Y5-GR-ADVERBIALS": { gen: y5Adverbials, types: ENGLISH_TYPES },
	"EN-Y5-SP-HOMOPHONES": { gen: y5Homophones, types: ENGLISH_TYPES },
};
