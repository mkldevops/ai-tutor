import { getObjective } from "#/curriculum/england-nc-maths";
import { buildPrintableItems, type Difficulty, difficultyFor, type PrintableItem } from "#/worksheets/printable";
import type { DataStore } from "../store/types";
import { AppError } from "./errors";
import { type Actor, audit, requireStudent } from "./family";
import { printableObjectives } from "./learning";

export type PrintableSheet = {
	student: { id: string; displayName: string; yearGroup: 3 | 5 };
	objective: { code: string; statement: string };
	variant: "worksheet" | "answer_key";
	difficulty: Difficulty;
	autoDifficulty: boolean;
	seed: string;
	items: PrintableItem[];
};

export async function getPrintableSheet(
	store: DataStore,
	actor: Actor,
	input: {
		studentId: string;
		objectiveCode: string;
		seed: string;
		count: number;
		difficulty: Difficulty | null;
		variant: "worksheet" | "answer_key";
	},
): Promise<PrintableSheet> {
	const student = await requireStudent(store, actor, input.studentId);
	if (!printableObjectives(student.yearGroup).includes(input.objectiveCode)) {
		throw new AppError("invalid", "Objective not available for this learner");
	}
	const objective = getObjective(input.objectiveCode);
	if (!objective) throw new AppError("invalid", "Unknown objective");
	let difficulty = input.difficulty;
	if (difficulty === null) {
		const [comp] = await store.student_competencies.list(
			{ studentId: student.id, objectiveCode: input.objectiveCode },
			{ limit: 1 },
		);
		difficulty = difficultyFor(comp?.status ?? "not_started");
	}
	const items = buildPrintableItems({
		objectiveCode: input.objectiveCode,
		difficulty,
		count: input.count,
		seed: input.seed,
	});
	await audit(store, actor, `worksheet.print_${input.variant}`, `students/${student.id}`, {
		objectiveCode: input.objectiveCode,
		difficulty,
		count: input.count,
		seed: input.seed,
	});
	const safeItems =
		input.variant === "worksheet" ? items.map((i) => ({ ...i, answer: "", workedSolution: "" })) : items;
	return {
		student: { id: student.id, displayName: student.displayName, yearGroup: student.yearGroup },
		objective: { code: objective.code, statement: objective.statement },
		variant: input.variant,
		difficulty,
		autoDifficulty: input.difficulty === null,
		seed: input.seed,
		items: safeItems,
	};
}
