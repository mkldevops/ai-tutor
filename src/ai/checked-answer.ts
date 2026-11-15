import { type ArithmeticError, findArithmeticErrors } from "./arithmetic-check";
import { finalAnswerText } from "./final-text";

type Output = { text: string; steps: { text: string; toolCalls: unknown[] }[] };

export const UNCHECKED_FALLBACK =
	"I couldn't double-check my maths this time, so please use the explanation above. Ask a grown-up if you are stuck.";

export async function generateCheckedAnswer(
	generate: (prompt: string) => Promise<Output>,
	prompt: string,
): Promise<{ text: string; attempts: number; errors: ArithmeticError[] }> {
	let request = prompt;
	let errors: ArithmeticError[] = [];
	for (let attempt = 1; attempt <= 2; attempt++) {
		const text = finalAnswerText(await generate(request));
		errors = findArithmeticErrors(text);
		if (errors.length === 0) return { text, attempts: attempt, errors };
		request = `${prompt}\n\nYour previous draft had wrong calculations: ${errors
			.map((e) => `"${e.claim}" (correct: ${e.correct})`)
			.join("; ")}. Write a new explanation. Check every calculation.`;
	}
	return { text: UNCHECKED_FALLBACK, attempts: 2, errors };
}
