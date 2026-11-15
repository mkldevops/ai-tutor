type StepText = { text: string; toolCalls: unknown[] };

export function finalAnswerText(out: { text: string; steps: StepText[] }): string {
	const last = [...out.steps].reverse().find((s) => s.toolCalls.length === 0 && s.text.trim() !== "");
	return (last?.text ?? out.text).trim();
}
