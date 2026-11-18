import {
	CERTAIN_WORDS,
	MODAL_SENTENCES,
	PAST_MARKERS,
	PERFECT_VERBS,
	PLURAL_SUBJECTS,
	POSSIBLE_WORDS,
	RELATIVE_SENTENCES,
	relativeClause,
	SPEECH_LINES,
	speechCorrect,
	speechUnpunctuated,
	TENSE_VERBS,
	Y3_PREFIX_WORDS,
	Y5_PREFIX_WORDS,
} from "../src/curriculum/english-bank";

const PREFIX_WORDS = [...Y3_PREFIX_WORDS, ...Y5_PREFIX_WORDS];

export function solveEnglish(prompt: string, choices: string[]): string | null {
	let m = prompt.match(/^(?:Which word fits\?|Write the correct form of "\w+":) (.+?), \S+ _____ (.+)\.$/);
	if (m) {
		const verb = TENSE_VERBS.find((v) => v.rest === m?.[2]);
		if (!verb) return null;
		return (PAST_MARKERS as readonly string[]).includes(m[1]) ? verb.past : verb.present;
	}
	m = prompt.match(/^Add a prefix to "(\w+)" to make a word that means "(.+)"\.$/);
	if (m) return PREFIX_WORDS.find((w) => w.root === m?.[1] && w.meaning === m?.[2])?.word ?? null;
	m = prompt.match(/^Which word means "(.+)"\?$/);
	if (m) return choices.find((c) => PREFIX_WORDS.some((w) => w.word === c && w.meaning === m?.[1])) ?? null;
	m = prompt.match(/present perfect of "(\w+)": (.+?) _____/);
	if (m) {
		const verb = PERFECT_VERBS.find((v) => v.base === m?.[1]);
		const plural = (PLURAL_SUBJECTS as readonly string[]).includes(m[2]);
		return verb ? `${plural ? "have" : "has"} ${verb.participle}` : null;
	}
	m = prompt.match(/^Which sentence punctuates what (\w+) \w+ correctly\?$/);
	if (m) {
		const line = SPEECH_LINES.find((l) => l.speaker === m?.[1]);
		return line ? speechCorrect(line) : null;
	}
	m = prompt.match(/^Add inverted commas: (.+)$/);
	if (m) {
		const line = SPEECH_LINES.find((l) => speechUnpunctuated(l) === m?.[1]);
		return line ? speechCorrect(line) : null;
	}
	m = prompt.match(/^Write the relative clause in this sentence: (.+)$/);
	if (m) {
		const s = RELATIVE_SENTENCES.find((x) => m?.[1].startsWith(`${x.before} ${x.pronoun} `));
		return s ? relativeClause(s) : null;
	}
	m = prompt.match(/^(?:Which word completes the sentence\?|Write the relative pronoun that fits:) (.+) _____ (.+)$/);
	if (m) return RELATIVE_SENTENCES.find((x) => x.before === m?.[1] && m?.[2].startsWith(x.clause))?.pronoun ?? null;
	if (prompt.startsWith("Which word shows that something is")) {
		const group: readonly string[] = prompt.includes("certain to happen") ? CERTAIN_WORDS : POSSIBLE_WORDS;
		return choices.find((c) => group.includes(c)) ?? null;
	}
	m = prompt.match(/^Write the modal verb in this sentence: (.+)$/);
	if (m) return MODAL_SENTENCES.find((s) => s.sentence === m?.[1])?.modal ?? null;
	return null;
}
