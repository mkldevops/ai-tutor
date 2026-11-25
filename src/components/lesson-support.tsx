import type { CompetencyStatus, LessonPhase, PublicItem } from "#/domain/types";

export const PHASE_SUPPORT: Record<Exclude<LessonPhase, "complete">, string> = {
	diagnostic: "Try one question at a time. It's okay if you are not sure yet.",
	instruction: "Explore this example at your own pace. You can go back whenever you like.",
	guided: "Try this question. A hint is here if you need one.",
	independent: "Your turn to try on your own. Take your time with each answer.",
	review: "Try this on your own to see what you remember. Take your time.",
};

/** Format cues describe the response, never the method or the answer. */
export function answerFormat(item: Pick<PublicItem, "type" | "choices">): string {
	if (item.choices) return "Choose one answer.";
	if (item.type === "written") return "Write the whole answer, then press Check.";
	if (item.type === "missing_number") return "Write just the missing number, then press Check.";
	return "Write the number answer, then press Check.";
}

export function completionMessage(status: CompetencyStatus): string {
	if (status === "mastered")
		return "Today's answers are saved. This skill is currently marked Mastered in your course. Later reviews can check what you remember.";
	if (status === "secure")
		return "Today's answers are saved. This skill is currently marked Secure in your course. A later review can check what you remember.";
	return "Today's answers are saved. There is more to practise, and you can take it one step at a time.";
}

export function LessonSummary({ title, status }: { title: string; status: CompetencyStatus }) {
	return (
		<div className="card space-y-3" data-testid="lesson-summary">
			<p className="meta">Today you worked on</p>
			<p className="font-display text-2xl">{title}</p>
			<p className="text-soft">{completionMessage(status)}</p>
		</div>
	);
}
