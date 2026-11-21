import type { ItemType } from "#/domain/types";
import {
	CERTAIN_WORDS,
	GAP,
	MODAL_SENTENCES,
	PAST_MARKERS,
	PERFECT_VERBS,
	PLURAL_SUBJECTS,
	POSSIBLE_WORDS,
	PRESENT_MARKERS,
	RELATIVE_PRONOUNS,
	RELATIVE_SENTENCES,
	relativeClause,
	relativeSentence,
	SINGULAR_SUBJECTS,
	SPEECH_LINES,
	speechCorrect,
	speechUnpunctuated,
	speechWrong,
	TENSE_VERBS,
	Y3_DISTRACTOR_PREFIXES,
	Y3_PREFIX_RULES,
	Y3_PREFIX_WORDS,
	Y5_PREFIX_RULES,
	Y5_PREFIX_WORDS,
	Y5_PREFIXES,
} from "./english-bank";
import { ENGLISH_GPS_GENERATORS } from "./english-gps-generators";
import { options, prefixGenerator, usSpellingVariants } from "./english-helpers";
import type { Generator } from "./generators";
import { pick, shuffle } from "./rng";

const ENGLISH_TYPES: ItemType[] = ["multiple_choice", "written"];
const TENSE_NAMES = ["Mia", "Leo", "Amira", "Ben"] as const;

const y2Tense: Generator = ({ rng, difficulty, type, id }) => {
	const verb = pick(rng, TENSE_VERBS);
	const past = rng() < 0.5;
	const marker = past ? pick(rng, PAST_MARKERS) : pick(rng, PRESENT_MARKERS);
	const sentence = `${marker}, ${pick(rng, TENSE_NAMES)} ${GAP} ${verb.rest}.`;
	const answer = past ? verb.past : verb.present;
	const tense = past ? "past" : "present";
	const mc = type === "multiple_choice";
	return {
		id,
		objectiveCode: "EN-Y2-GR-TENSE",
		type: mc ? "multiple_choice" : "written",
		difficulty,
		prompt: mc ? `Which word fits? ${sentence}` : `Write the correct form of "${verb.base}": ${sentence}`,
		...(mc ? { choices: options(rng, answer, [verb.past, verb.present, verb.base]) } : {}),
		answer,
		hint: `"${marker}" tells you when it happens. Is that the past or the present?`,
		workedSolution: `"${marker}" means the ${tense} tense, so the verb is "${answer}".`,
	};
};

const y3Prefixes = prefixGenerator(
	"EN-Y3-SP-PREFIXES",
	Y3_PREFIX_WORDS,
	Y3_PREFIX_RULES,
	(_rng, w) => Y3_DISTRACTOR_PREFIXES[w.prefix] ?? [],
);

const y5VerbPrefixes = prefixGenerator("EN-Y5-SP-VERB-PREFIXES", Y5_PREFIX_WORDS, Y5_PREFIX_RULES, (rng, w) =>
	shuffle(
		rng,
		Y5_PREFIXES.filter((p) => p !== w.prefix),
	),
);

const y3PresentPerfect: Generator = ({ rng, difficulty, type, id }) => {
	const verb = pick(rng, PERFECT_VERBS);
	const plural = rng() < 0.5;
	const subject = plural ? pick(rng, PLURAL_SUBJECTS) : pick(rng, SINGULAR_SUBJECTS);
	const aux = plural ? "have" : "has";
	const other = plural ? "has" : "have";
	const answer = `${aux} ${verb.participle}`;
	const sentence = `${subject} ${GAP} ${verb.rest}.`;
	const mc = type === "multiple_choice";
	const wrongPast = verb.past === verb.participle ? `${aux} ${verb.base}` : `${aux} ${verb.past}`;
	return {
		id,
		objectiveCode: "EN-Y3-GR-PRESENT-PERFECT",
		type: mc ? "multiple_choice" : "written",
		difficulty,
		prompt: mc
			? `Choose the present perfect of "${verb.base}": ${sentence}`
			: `Write the present perfect of "${verb.base}": ${sentence}`,
		...(mc ? { choices: options(rng, answer, [`${other} ${verb.participle}`, verb.past, wrongPast]) } : {}),
		answer,
		hint: `Use "${aux}" with "${subject}", then the past participle of "${verb.base}".`,
		workedSolution: `${subject} → "${aux}". The past participle of "${verb.base}" is "${verb.participle}": ${answer}.`,
	};
};

const y3InvertedCommas: Generator = ({ rng, difficulty, type, id }) => {
	const line = pick(rng, SPEECH_LINES);
	const answer = speechCorrect(line);
	const mc = type === "multiple_choice";
	return {
		id,
		objectiveCode: "EN-Y3-PU-INVERTED-COMMAS",
		type: mc ? "multiple_choice" : "written",
		difficulty,
		prompt: mc
			? `Which sentence punctuates what ${line.speaker} ${line.verb} correctly?`
			: `Add inverted commas: ${speechUnpunctuated(line)}`,
		...(mc ? { choices: options(rng, answer, speechWrong(line)) } : usSpellingVariants(answer)),
		answer,
		hint: `Put " before the first spoken word and " after the ${line.end === "," ? "comma" : `${line.end} mark`} that ends the speech.`,
		workedSolution: `Only the spoken words go inside the inverted commas: ${answer}`,
	};
};

const y5RelativeClauses: Generator = ({ rng, difficulty, type, id }) => {
	const s = pick(rng, RELATIVE_SENTENCES);
	const mc = type === "multiple_choice";
	const clause = !mc && difficulty === 3;
	const answer = clause ? relativeClause(s) : s.pronoun;
	const prompt = mc
		? `Which word completes the sentence? ${relativeSentence(s, true)}`
		: clause
			? `Write the relative clause in this sentence: ${relativeSentence(s)}`
			: `Write the relative pronoun that fits: ${relativeSentence(s, true)}`;
	return {
		id,
		objectiveCode: "EN-Y5-GR-RELATIVE-CLAUSES",
		type: mc ? "multiple_choice" : "written",
		difficulty,
		prompt,
		...(mc
			? {
					choices: options(
						rng,
						s.pronoun,
						shuffle(
							rng,
							RELATIVE_PRONOUNS.filter((p) => p !== s.pronoun),
						),
					),
				}
			: {}),
		answer,
		hint: "who is for people, which for things, where for places, when for times, whose for belonging.",
		workedSolution: `The relative clause is "${relativeClause(s)}". It starts with "${s.pronoun}".`,
	};
};

const y5Possibility: Generator = ({ rng, difficulty, type, id }) => {
	if (type === "multiple_choice") {
		const certain = rng() < 0.5;
		const right = certain ? CERTAIN_WORDS : POSSIBLE_WORDS;
		const wrong = certain ? POSSIBLE_WORDS : CERTAIN_WORDS;
		const answer = pick(rng, right);
		return {
			id,
			objectiveCode: "EN-Y5-GR-POSSIBILITY",
			type: "multiple_choice",
			difficulty,
			prompt: certain
				? "Which word shows that something is certain to happen?"
				: "Which word shows that something is possible but not certain?",
			choices: options(rng, answer, shuffle(rng, [...wrong])),
			answer,
			hint: "Certain: will, must, definitely, certainly. Possible: might, may, could, perhaps, possibly, maybe.",
			workedSolution: `"${answer}" shows that something is ${certain ? "certain" : "possible but not certain"}.`,
		};
	}
	const s = pick(rng, MODAL_SENTENCES);
	return {
		id,
		objectiveCode: "EN-Y5-GR-POSSIBILITY",
		type: "written",
		difficulty,
		prompt: `Write the modal verb in this sentence: ${s.sentence}`,
		answer: s.modal,
		hint: "A modal verb comes just before the main verb: can, could, may, might, must, shall, should, will, would.",
		workedSolution: `"${s.modal}" is the modal verb. It tells you how likely or necessary the action is.`,
	};
};

export const ENGLISH_GENERATORS: Record<string, { gen: Generator; types: ItemType[] }> = {
	"EN-Y2-GR-TENSE": { gen: y2Tense, types: ENGLISH_TYPES },
	"EN-Y3-SP-PREFIXES": { gen: y3Prefixes, types: ENGLISH_TYPES },
	"EN-Y3-GR-PRESENT-PERFECT": { gen: y3PresentPerfect, types: ENGLISH_TYPES },
	"EN-Y3-PU-INVERTED-COMMAS": { gen: y3InvertedCommas, types: ENGLISH_TYPES },
	"EN-Y5-SP-VERB-PREFIXES": { gen: y5VerbPrefixes, types: ENGLISH_TYPES },
	"EN-Y5-GR-RELATIVE-CLAUSES": { gen: y5RelativeClauses, types: ENGLISH_TYPES },
	"EN-Y5-GR-POSSIBILITY": { gen: y5Possibility, types: ENGLISH_TYPES },
	...ENGLISH_GPS_GENERATORS,
};
