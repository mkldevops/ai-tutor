export const GAP = "_____";

export type TenseVerb = { base: string; present: string; past: string; rest: string };

export const TENSE_VERBS: readonly TenseVerb[] = [
	{ base: "walk", present: "walks", past: "walked", rest: "to the park" },
	{ base: "jump", present: "jumps", past: "jumped", rest: "over the puddle" },
	{ base: "play", present: "plays", past: "played", rest: "football after school" },
	{ base: "run", present: "runs", past: "ran", rest: "to the shop" },
	{ base: "eat", present: "eats", past: "ate", rest: "an apple at lunch" },
	{ base: "sing", present: "sings", past: "sang", rest: "in the choir" },
	{ base: "write", present: "writes", past: "wrote", rest: "a story" },
	{ base: "swim", present: "swims", past: "swam", rest: "in the pool" },
	{ base: "drink", present: "drinks", past: "drank", rest: "a glass of milk" },
	{ base: "draw", present: "draws", past: "drew", rest: "a picture of a cat" },
];

export const PAST_MARKERS = ["Yesterday", "Last week", "Last night"] as const;
export const PRESENT_MARKERS = ["Every day", "Every morning", "On Saturdays"] as const;

export type PrefixWord = { prefix: string; root: string; word: string; meaning: string };

export const Y3_PREFIX_WORDS: readonly PrefixWord[] = [
	{ prefix: "dis", root: "agree", word: "disagree", meaning: "not agree" },
	{ prefix: "dis", root: "obey", word: "disobey", meaning: "not obey" },
	{ prefix: "mis", root: "behave", word: "misbehave", meaning: "behave badly" },
	{ prefix: "mis", root: "spell", word: "misspell", meaning: "spell wrongly" },
	{ prefix: "in", root: "active", word: "inactive", meaning: "not active" },
	{ prefix: "in", root: "correct", word: "incorrect", meaning: "not correct" },
	{ prefix: "il", root: "legal", word: "illegal", meaning: "not legal" },
	{ prefix: "im", root: "possible", word: "impossible", meaning: "not possible" },
	{ prefix: "im", root: "patient", word: "impatient", meaning: "not patient" },
	{ prefix: "im", root: "perfect", word: "imperfect", meaning: "not perfect" },
	{ prefix: "im", root: "mature", word: "immature", meaning: "not mature" },
	{ prefix: "ir", root: "regular", word: "irregular", meaning: "not regular" },
	{ prefix: "ir", root: "responsible", word: "irresponsible", meaning: "not responsible" },
	{ prefix: "re", root: "do", word: "redo", meaning: "do again" },
	{ prefix: "re", root: "appear", word: "reappear", meaning: "appear again" },
	{ prefix: "re", root: "turn", word: "return", meaning: "turn back" },
	{ prefix: "sub", root: "heading", word: "subheading", meaning: "a heading under another heading" },
	{ prefix: "sub", root: "marine", word: "submarine", meaning: "a ship that goes under the sea" },
	{ prefix: "inter", root: "act", word: "interact", meaning: "act with each other" },
	{ prefix: "inter", root: "national", word: "international", meaning: "between nations" },
];

export const Y3_PREFIX_RULES: Record<string, string> = {
	dis: "dis– means not, or the opposite of.",
	mis: "mis– means badly or wrongly.",
	in: "in– means not.",
	il: "in– becomes il– before a word starting with l.",
	im: "in– becomes im– before a word starting with m or p.",
	ir: "in– becomes ir– before a word starting with r.",
	re: "re– means again or back.",
	sub: "sub– means under.",
	inter: "inter– means between or among.",
};

export const Y3_DISTRACTOR_PREFIXES: Record<string, readonly string[]> = {
	dis: ["un", "mis", "in"],
	mis: ["dis", "un", "in"],
	in: ["un", "dis", "im"],
	il: ["in", "un", "dis"],
	im: ["in", "un", "dis"],
	ir: ["in", "un", "dis"],
	re: ["sub", "inter", "mis"],
	sub: ["re", "inter", "mis"],
	inter: ["sub", "mis", "dis"],
};

export type PerfectVerb = { base: string; participle: string; past: string; rest: string };

export const PERFECT_VERBS: readonly PerfectVerb[] = [
	{ base: "finish", participle: "finished", past: "finished", rest: "the homework" },
	{ base: "eat", participle: "eaten", past: "ate", rest: "all the grapes" },
	{ base: "go", participle: "gone", past: "went", rest: "out to play" },
	{ base: "write", participle: "written", past: "wrote", rest: "a letter to Gran" },
	{ base: "break", participle: "broken", past: "broke", rest: "the window" },
	{ base: "see", participle: "seen", past: "saw", rest: "the new film" },
	{ base: "take", participle: "taken", past: "took", rest: "the dog for a walk" },
	{ base: "climb", participle: "climbed", past: "climbed", rest: "the big hill" },
	{ base: "draw", participle: "drawn", past: "drew", rest: "a map of the town" },
	{ base: "open", participle: "opened", past: "opened", rest: "the present" },
];

export const SINGULAR_SUBJECTS = ["Leo", "Amira", "My brother", "The teacher"] as const;
export const PLURAL_SUBJECTS = ["We", "They", "The children", "My friends"] as const;

export type SpeechLine = { words: string; end: "?" | "!" | ","; verb: string; speaker: string };

export const SPEECH_LINES: readonly SpeechLine[] = [
	{ words: "Can we go now", end: "?", verb: "asked", speaker: "Ella" },
	{ words: "Where is my bag", end: "?", verb: "asked", speaker: "Omar" },
	{ words: "Look at that rainbow", end: "!", verb: "shouted", speaker: "Sam" },
	{ words: "Watch out", end: "!", verb: "cried", speaker: "Mum" },
	{ words: "I am hungry", end: ",", verb: "said", speaker: "Tom" },
	{ words: "It is time for bed", end: ",", verb: "said", speaker: "Dad" },
	{ words: "The bus is late", end: ",", verb: "said", speaker: "Priya" },
	{ words: "Who wants a drink", end: "?", verb: "asked", speaker: "Nana" },
];

export function speechCorrect(l: SpeechLine): string {
	return `"${l.words}${l.end}" ${l.verb} ${l.speaker}.`;
}

export function speechUnpunctuated(l: SpeechLine): string {
	return `${l.words}${l.end === "," ? "" : l.end} ${l.verb} ${l.speaker}.`;
}

export function speechWrong(l: SpeechLine): string[] {
	return [
		`${l.words}${l.end} ${l.verb} ${l.speaker}.`,
		`"${l.words}${l.end} ${l.verb} ${l.speaker}."`,
		`"${l.words}"${l.end} ${l.verb} ${l.speaker}.`,
	];
}

export const Y5_PREFIX_WORDS: readonly PrefixWord[] = [
	{ prefix: "dis", root: "connect", word: "disconnect", meaning: "undo a connection" },
	{ prefix: "dis", root: "like", word: "dislike", meaning: "not like" },
	{ prefix: "dis", root: "allow", word: "disallow", meaning: "not allow" },
	{ prefix: "de", root: "frost", word: "defrost", meaning: "remove the frost from" },
	{ prefix: "de", root: "code", word: "decode", meaning: "turn a code back into words" },
	{ prefix: "de", root: "throne", word: "dethrone", meaning: "remove from the throne" },
	{ prefix: "mis", root: "place", word: "misplace", meaning: "put in the wrong place" },
	{ prefix: "mis", root: "understand", word: "misunderstand", meaning: "understand wrongly" },
	{ prefix: "mis", root: "hear", word: "mishear", meaning: "hear wrongly" },
	{ prefix: "over", root: "sleep", word: "oversleep", meaning: "sleep for too long" },
	{ prefix: "over", root: "cook", word: "overcook", meaning: "cook for too long" },
	{ prefix: "over", root: "eat", word: "overeat", meaning: "eat too much" },
	{ prefix: "re", root: "build", word: "rebuild", meaning: "build again" },
	{ prefix: "re", root: "write", word: "rewrite", meaning: "write again" },
	{ prefix: "re", root: "heat", word: "reheat", meaning: "heat again" },
];

export const Y5_PREFIX_RULES: Record<string, string> = {
	dis: "dis– means not, or undo.",
	de: "de– means remove, or reverse.",
	mis: "mis– means wrongly.",
	over: "over– means too much.",
	re: "re– means again.",
};

export const Y5_PREFIXES = ["dis", "de", "mis", "over", "re"] as const;

export type RelativeSentence = { before: string; pronoun: string; clause: string; after: string };

export const RELATIVE_SENTENCES: readonly RelativeSentence[] = [
	{ before: "My sister,", pronoun: "who", clause: "is ten,", after: "loves swimming." },
	{ before: "Our dog,", pronoun: "which", clause: "is very old,", after: "sleeps all day." },
	{ before: "Paris,", pronoun: "where", clause: "my aunt lives,", after: "is in France." },
	{ before: "Saturday,", pronoun: "when", clause: "we play football,", after: "is my best day." },
	{ before: "Mr Khan,", pronoun: "whose", clause: "car was stolen,", after: "called the police." },
	{ before: "The museum,", pronoun: "which", clause: "opened in May,", after: "is free." },
	{ before: "Grandad,", pronoun: "who", clause: "grew up in Leeds,", after: "tells great stories." },
	{ before: "The park,", pronoun: "where", clause: "we had our picnic,", after: "has a lake." },
	{ before: "Ruby,", pronoun: "whose", clause: "kite got stuck,", after: "climbed the tree." },
	{ before: "Winter,", pronoun: "when", clause: "the nights are long,", after: "can be cold." },
];

export const RELATIVE_PRONOUNS = ["who", "which", "where", "when", "whose"] as const;

export function relativeSentence(s: RelativeSentence, gap = false): string {
	return `${s.before} ${gap ? GAP : s.pronoun} ${s.clause} ${s.after}`;
}

export function relativeClause(s: RelativeSentence): string {
	return `${s.pronoun} ${s.clause.replace(/,$/, "")}`;
}

export const CERTAIN_WORDS = ["will", "must", "definitely", "certainly"] as const;
export const POSSIBLE_WORDS = ["might", "may", "could", "perhaps", "possibly", "maybe"] as const;

export type ModalSentence = { sentence: string; modal: string };

export const MODAL_SENTENCES: readonly ModalSentence[] = [
	{ sentence: "Tom might come to the party.", modal: "might" },
	{ sentence: "We must leave at six o'clock.", modal: "must" },
	{ sentence: "It could snow tonight.", modal: "could" },
	{ sentence: "You should wear a coat.", modal: "should" },
	{ sentence: "The bus will arrive soon.", modal: "will" },
	{ sentence: "Dad may cook pasta for tea.", modal: "may" },
	{ sentence: "Aliyah can swim two lengths.", modal: "can" },
	{ sentence: "Kai would like a puppy.", modal: "would" },
];
