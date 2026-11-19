import type { PrefixWord } from "./english-bank";

export type ArticlePhrase = { article: "a" | "an"; noun: string };

export const ARTICLE_PHRASES: readonly ArticlePhrase[] = [
	{ article: "a", noun: "rock" },
	{ article: "an", noun: "open box" },
	{ article: "an", noun: "apple" },
	{ article: "an", noun: "elephant" },
	{ article: "an", noun: "egg" },
	{ article: "an", noun: "insect" },
	{ article: "an", noun: "octopus" },
	{ article: "an", noun: "igloo" },
	{ article: "an", noun: "angry cat" },
	{ article: "an", noun: "empty cup" },
	{ article: "an", noun: "old map" },
	{ article: "a", noun: "dog" },
	{ article: "a", noun: "banana" },
	{ article: "a", noun: "kite" },
	{ article: "a", noun: "pencil" },
	{ article: "a", noun: "big orange" },
	{ article: "a", noun: "red apple" },
	{ article: "a", noun: "little ant" },
	{ article: "a", noun: "tiny egg" },
];

export const wrongArticle = (p: ArticlePhrase): "a" | "an" => (p.article === "a" ? "an" : "a");

export type LinkSentence = { sentence: string; answer: string; distractors: readonly string[] };

export const LINK_SENTENCES: readonly LinkSentence[] = [
	{ sentence: "We stayed inside _____ it was raining.", answer: "because", distractors: ["during", "therefore"] },
	{ sentence: "The match was cancelled _____ the snow.", answer: "because of", distractors: ["because", "while"] },
	{ sentence: "Brush your teeth _____ you go to bed.", answer: "before", distractors: ["during", "because of"] },
	{ sentence: "We ate popcorn _____ the film.", answer: "during", distractors: ["because", "therefore"] },
	{ sentence: "Tom read a book _____ he waited for the bus.", answer: "while", distractors: ["during", "because of"] },
	{ sentence: "The keys are _____ my bag.", answer: "in", distractors: ["because", "while"] },
	{ sentence: "Put on your boots _____ you go out in the snow.", answer: "when", distractors: ["during", "therefore"] },
	{
		sentence: "We will have lunch _____ we finish this game.",
		answer: "after",
		distractors: ["during", "because of"],
	},
	{
		sentence: "First we mixed the flour and eggs. _____ we put the cake in the oven.",
		answer: "Then",
		distractors: ["During", "Because of"],
	},
	{
		sentence: "The road was icy. _____, the bus drove slowly.",
		answer: "Therefore",
		distractors: ["During", "While"],
	},
];

export const NOUN_PREFIX_WORDS: readonly PrefixWord[] = [
	{ prefix: "super", root: "market", word: "supermarket", meaning: "a very large shop that sells food" },
	{ prefix: "super", root: "star", word: "superstar", meaning: "a very famous performer" },
	{ prefix: "super", root: "power", word: "superpower", meaning: "a power far greater than normal" },
	{ prefix: "anti", root: "freeze", word: "antifreeze", meaning: "a liquid that works against freezing" },
	{ prefix: "auto", root: "graph", word: "autograph", meaning: "a famous person's own signature" },
	{ prefix: "auto", root: "pilot", word: "autopilot", meaning: "a system that flies a plane by itself" },
	{
		prefix: "auto",
		root: "biography",
		word: "autobiography",
		meaning: "the story of a person's life written by that person",
	},
];

export const NOUN_PREFIXES = ["super", "anti", "auto"] as const;

export const NOUN_PREFIX_RULES: Record<string, string> = {
	super: "super– means above, more than or very.",
	anti: "anti– means against.",
	auto: "auto– means self or own.",
};

export type WordFamily = {
	root: string;
	members: readonly { word: string; meaning: string }[];
	lookalikes: readonly string[];
};

export const WORD_FAMILIES: readonly WordFamily[] = [
	{
		root: "solve",
		members: [
			{ word: "solution", meaning: "the answer to a problem" },
			{ word: "solver", meaning: "a person who solves something" },
		],
		lookalikes: ["sold", "solid", "slow"],
	},
	{
		root: "teach",
		members: [
			{ word: "teacher", meaning: "a person who teaches" },
			{ word: "taught", meaning: "the past tense of teach" },
		],
		lookalikes: ["tea", "beach", "team"],
	},
	{
		root: "help",
		members: [
			{ word: "helpful", meaning: "full of help" },
			{ word: "helpless", meaning: "without help" },
		],
		lookalikes: ["hello", "helmet", "heap"],
	},
	{
		root: "sign",
		members: [
			{ word: "signature", meaning: "your name written in your own way" },
			{ word: "signal", meaning: "a sign or sound that gives a message" },
		],
		lookalikes: ["sing", "sigh", "sight"],
	},
	{
		root: "act",
		members: [
			{ word: "action", meaning: "something that you do" },
			{ word: "actor", meaning: "a person who acts in plays or films" },
		],
		lookalikes: ["fact", "ant", "cat"],
	},
	{
		root: "child",
		members: [
			{ word: "childhood", meaning: "the time when you are a child" },
			{ word: "children", meaning: "more than one child" },
		],
		lookalikes: ["chill", "mild", "chilli"],
	},
	{
		root: "friend",
		members: [
			{ word: "friendship", meaning: "the bond between friends" },
			{ word: "friendly", meaning: "kind and helpful, like a friend" },
		],
		lookalikes: ["fried", "fiend", "fridge"],
	},
	{
		root: "happy",
		members: [
			{ word: "happiness", meaning: "the feeling of being happy" },
			{ word: "unhappy", meaning: "not happy" },
		],
		lookalikes: ["nappy", "hippo", "puppy"],
	},
	{
		root: "play",
		members: [
			{ word: "player", meaning: "a person who plays" },
			{ word: "playful", meaning: "full of fun" },
		],
		lookalikes: ["plan", "plate", "pray"],
	},
	{
		root: "kind",
		members: [
			{ word: "kindness", meaning: "being kind" },
			{ word: "unkind", meaning: "not kind" },
		],
		lookalikes: ["kid", "king", "find"],
	},
];

export type VerbSuffix = "ise" | "ify" | "ate";

export type SuffixVerb = {
	root: string;
	kind: "noun" | "adjective";
	stem: string;
	suffix: VerbSuffix;
	rule?: string;
};

export const VERB_SUFFIXES: readonly VerbSuffix[] = ["ise", "ify", "ate"];

export const SUFFIX_VERBS: readonly SuffixVerb[] = [
	{ root: "real", kind: "adjective", stem: "real", suffix: "ise" },
	{ root: "final", kind: "adjective", stem: "final", suffix: "ise" },
	{ root: "standard", kind: "noun", stem: "standard", suffix: "ise" },
	{ root: "fossil", kind: "noun", stem: "fossil", suffix: "ise" },
	{ root: "apology", kind: "noun", stem: "apolog", suffix: "ise", rule: "Drop the y before adding the suffix." },
	{ root: "critic", kind: "noun", stem: "critic", suffix: "ise" },
	{ root: "pure", kind: "adjective", stem: "pur", suffix: "ify", rule: "Drop the e before adding the suffix." },
	{ root: "intense", kind: "adjective", stem: "intens", suffix: "ify", rule: "Drop the e before adding the suffix." },
	{ root: "class", kind: "noun", stem: "class", suffix: "ify" },
	{ root: "glory", kind: "noun", stem: "glor", suffix: "ify", rule: "Drop the y before adding the suffix." },
	{ root: "origin", kind: "noun", stem: "origin", suffix: "ate" },
	{ root: "captive", kind: "adjective", stem: "captiv", suffix: "ate", rule: "Drop the e before adding the suffix." },
	{ root: "motive", kind: "noun", stem: "motiv", suffix: "ate", rule: "Drop the e before adding the suffix." },
];

export const suffixVerb = (v: SuffixVerb): string => `${v.stem}${v.suffix}`;

export type Parenthesis = { before: string; extra: string; after: string };

export const PARENTHESIS_SENTENCES: readonly Parenthesis[] = [
	{ before: "My uncle", extra: "who lives in Wales", after: "is a farmer." },
	{ before: "Mount Everest", extra: "the highest mountain in the world", after: "is in Asia." },
	{ before: "Our teacher", extra: "Mr Patel", after: "plays the guitar." },
	{ before: "The old castle", extra: "which was built in 1250", after: "is now a museum." },
	{ before: "Ella", extra: "my best friend", after: "won the race." },
	{ before: "The Moon", extra: "our nearest neighbour in space", after: "orbits the Earth." },
	{ before: "Our dog", extra: "a lazy spaniel", after: "sleeps all day." },
	{ before: "The Thames", extra: "a famous river", after: "flows through London." },
];

export type ParenthesisMark = "brackets" | "dashes" | "commas";

export const PARENTHESIS_MARKS: readonly ParenthesisMark[] = ["brackets", "dashes", "commas"];

const OPEN: Record<ParenthesisMark, string> = { brackets: " (", dashes: " – ", commas: ", " };
const CLOSE: Record<ParenthesisMark, string> = { brackets: ") ", dashes: " – ", commas: ", " };

export function withParenthesis(p: Parenthesis, mark: ParenthesisMark): string {
	return `${p.before}${OPEN[mark]}${p.extra}${CLOSE[mark]}${p.after}`;
}

export function misplacedParenthesis(p: Parenthesis, mark: ParenthesisMark): string[] {
	const [firstExtra, ...restExtra] = p.extra.split(" ");
	const [firstAfter, ...restAfter] = p.after.split(" ");
	return [
		`${p.before} ${firstExtra}${OPEN[mark]}${restExtra.join(" ")}${CLOSE[mark]}${p.after}`,
		`${p.before}${OPEN[mark]}${p.extra} ${firstAfter}${CLOSE[mark]}${restAfter.join(" ")}`,
		`${p.before}${OPEN[mark]}${p.extra} ${p.after}`,
	];
}

export type AdverbialKind = "time" | "place" | "number";

export const ADVERBIAL_KINDS: readonly AdverbialKind[] = ["time", "place", "number"];

export type FrontedAdverbial = { adverbial: string; kind: AdverbialKind; rest: string };

export const FRONTED_ADVERBIALS: readonly FrontedAdverbial[] = [
	{ adverbial: "Later", kind: "time", rest: "the children returned to the camp." },
	{ adverbial: "After that", kind: "time", rest: "we packed our bags." },
	{ adverbial: "The next morning", kind: "time", rest: "the storm had passed." },
	{ adverbial: "Meanwhile", kind: "time", rest: "Dad was cooking dinner." },
	{ adverbial: "Nearby", kind: "place", rest: "a fox was watching." },
	{ adverbial: "Further down the road", kind: "place", rest: "there was a bakery." },
	{ adverbial: "In the forest", kind: "place", rest: "the trees were tall and dark." },
	{ adverbial: "Across the river", kind: "place", rest: "a castle stood on a hill." },
	{ adverbial: "Behind the school", kind: "place", rest: "there is a small pond." },
	{ adverbial: "Firstly", kind: "number", rest: "heat the oven." },
	{ adverbial: "Secondly", kind: "number", rest: "mix the flour and butter." },
	{ adverbial: "Thirdly", kind: "number", rest: "roll out the dough." },
];

export const frontedSentence = (a: FrontedAdverbial): string => `${a.adverbial}, ${a.rest}`;

export type HomophoneSentence = { sentence: string; answer: string; confusable: string; extra: string };

export const HOMOPHONE_SENTENCES: readonly HomophoneSentence[] = [
	{ sentence: "We had ice cream for _____ after dinner.", answer: "dessert", confusable: "desert", extra: "steel" },
	{ sentence: "Camels can walk across the _____ for days.", answer: "desert", confusable: "dessert", extra: "cereal" },
	{ sentence: "The farmer moved the _____ of cows.", answer: "herd", confusable: "heard", extra: "advice" },
	{ sentence: "I _____ a loud bang outside.", answer: "heard", confusable: "herd", extra: "steel" },
	{ sentence: "I eat a bowl of _____ for breakfast.", answer: "cereal", confusable: "serial", extra: "guest" },
	{ sentence: "Talking is not _____ during the test.", answer: "allowed", confusable: "aloud", extra: "dessert" },
	{ sentence: "Please read the poem _____ to the class.", answer: "aloud", confusable: "allowed", extra: "steel" },
	{ sentence: "We _____ the old church on our walk.", answer: "passed", confusable: "past", extra: "herd" },
	{ sentence: "It was half _____ three when we arrived.", answer: "past", confusable: "passed", extra: "cereal" },
	{ sentence: "_____ coat is this?", answer: "Whose", confusable: "Who's", extra: "Desert" },
	{ sentence: "_____ coming to the party?", answer: "Who's", confusable: "Whose", extra: "Steel" },
	{ sentence: "The bridge is made of _____.", answer: "steel", confusable: "steal", extra: "advice" },
	{ sentence: "The thief tried to _____ a bike.", answer: "steal", confusable: "steel", extra: "cereal" },
	{ sentence: "The car was _____ at the red light.", answer: "stationary", confusable: "stationery", extra: "dessert" },
	{
		sentence: "We keep pens and paper in the _____ cupboard.",
		answer: "stationery",
		confusable: "stationary",
		extra: "herd",
	},
	{ sentence: "My dad gave me some good _____.", answer: "advice", confusable: "advise", extra: "steel" },
	{ sentence: "Can you _____ me what to do?", answer: "advise", confusable: "advice", extra: "cereal" },
	{ sentence: "I need to _____ the piano every day.", answer: "practise", confusable: "practice", extra: "herd" },
	{ sentence: "We have football _____ on Tuesday.", answer: "practice", confusable: "practise", extra: "aloud" },
	{ sentence: "I _____ the answer and got it right.", answer: "guessed", confusable: "guest", extra: "dessert" },
	{ sentence: "Our _____ stayed for dinner.", answer: "guest", confusable: "guessed", extra: "aloud" },
];
