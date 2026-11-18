import { findArithmeticErrors, NUM } from "./arithmetic-check";

export type GuardStop = "arithmetic" | "answer_leak" | "too_long";
export type GuardEvent = { type: "text"; text: string } | { type: "stopped"; reason: GuardStop; text: string };

export const STOP_NOTICES: Record<GuardStop, string> = {
	arithmetic: "Hmm, I muddled my maths there, so I will stop. Look at the explanation again or ask me another way.",
	answer_leak:
		"I can't give you the answer to this question, but you can do it! Try a hint, or tell me your first step.",
	too_long: "That's a lot of talking from me. What do you think so far?",
};

export class ReplyCutError extends Error {
	constructor(readonly finishReason: string) {
		super(`reply cut: ${finishReason}`);
	}
}

const BOUNDARY = /[.!?](?=\s)|\n/g;
const NUMBER = new RegExp(NUM, "g");

const normalise = (s: string) =>
	s
		.normalize("NFKC")
		.replace(/[\u201C\u201D\u201E\u00AB\u00BB]/g, '"')
		.replace(/[\u2018\u2019]/g, "'")
		.trim()
		.toLowerCase()
		.replace(/,/g, "")
		.replace(/\s+/g, " ");

export function leaksAnswer(sentence: string, answers: string[]): boolean {
	const numbers = new Set([...sentence.matchAll(NUMBER)].map((m) => Number(m[0].replace(/,/g, ""))));
	const text = normalise(sentence);
	return answers.some((raw) => {
		const answer = normalise(raw);
		if (answer === "") return false;
		const asNumber = Number(answer);
		if (Number.isFinite(asNumber)) return numbers.has(asNumber);
		const escaped = answer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`).test(text);
	});
}

function check(sentence: string, answers: string[]): GuardStop | null {
	if (findArithmeticErrors(sentence).length > 0) return "arithmetic";
	if (leaksAnswer(sentence, answers)) return "answer_leak";
	return null;
}

export async function* guardReply(
	source: AsyncIterable<string>,
	opts: { forbiddenAnswers: string[]; maxChars: number },
): AsyncGenerator<GuardEvent> {
	let buffer = "";
	let sent = 0;
	const stop = (reason: GuardStop): GuardEvent => ({
		type: "stopped",
		reason,
		text: `${sent > 0 ? " " : ""}${STOP_NOTICES[reason]}`,
	});
	const release = function* (sentence: string): Generator<GuardEvent, boolean> {
		if (sentence.trim() === "") {
			if (sent > 0) yield { type: "text", text: sentence };
			return true;
		}
		const problem = check(sentence, opts.forbiddenAnswers);
		if (problem) {
			yield stop(problem);
			return false;
		}
		if (sent + sentence.length > opts.maxChars) {
			yield stop("too_long");
			return false;
		}
		sent += sentence.length;
		yield { type: "text", text: sentence };
		return true;
	};
	for await (const chunk of source) {
		buffer += chunk;
		let cut = 0;
		for (const m of buffer.matchAll(BOUNDARY)) cut = m.index + m[0].length;
		if (cut === 0) {
			if (buffer.length > opts.maxChars) {
				yield stop("too_long");
				return;
			}
			continue;
		}
		const ready = buffer.slice(0, cut);
		buffer = buffer.slice(cut);
		if (!(yield* release(ready))) return;
	}
	yield* release(buffer);
}
