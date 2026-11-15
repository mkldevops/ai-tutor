import { describe, expect, it } from "vitest";
import { OBJECTIVES } from "#/curriculum/england-nc-maths";
import { createRng, generateItem, hasGenerator, supportedTypes } from "#/curriculum/generators";
import { gradeResponse, normaliseNumeric } from "./grading";
import {
	continueToPractice,
	currentItem,
	LESSON_SIZES,
	LessonError,
	type LessonState,
	requestHint,
	startLesson,
	submitAnswer,
	viewLesson,
} from "./lesson";

function answerAll(state: LessonState, correct: (s: LessonState) => boolean) {
	let s = state;
	while (s.phase !== "complete") {
		if (s.phase === "instruction") {
			s = continueToPractice(s);
			continue;
		}
		const item = currentItem(s);
		if (!item) throw new Error("no item");
		s = submitAnswer(s, correct(s) ? item.answer : "-1").state;
	}
	return s;
}

describe("generators", () => {
	for (const o of OBJECTIVES) {
		it(`${o.code}: every item type grades its own answer as correct`, () => {
			expect(hasGenerator(o.code)).toBe(true);
			for (let seed = 0; seed < 200; seed++) {
				for (const type of supportedTypes(o.code)) {
					for (const difficulty of [1, 2, 3] as const) {
						const item = generateItem(o.code, { rng: createRng(seed), difficulty, type, id: "x" });
						expect(gradeResponse(item, item.answer).correct, item.prompt).toBe(true);
						if (item.choices) expect(item.choices).toContain(item.answer);
						if (o.code === "MA-Y3-AS-MENTAL" && type === "numeric") {
							const n = Number(item.answer);
							expect(n).toBeGreaterThanOrEqual(0);
							expect(n).toBeLessThanOrEqual(999);
						}
					}
				}
			}
		});
	}

	it("is deterministic for a given seed", () => {
		const a = generateItem("MA-Y5-MD-POWERS10", { rng: createRng(42), difficulty: 2, id: "a" });
		const b = generateItem("MA-Y5-MD-POWERS10", { rng: createRng(42), difficulty: 2, id: "a" });
		expect(a).toEqual(b);
	});
});

describe("grading", () => {
	it("normalises spaces, commas and plus signs", () => {
		expect(normaliseNumeric(" 1,000 ")).toBe(1000);
		expect(normaliseNumeric("+0.50")).toBe(0.5);
		expect(normaliseNumeric(".5")).toBe(0.5);
		expect(normaliseNumeric("abc")).toBeNull();
		expect(normaliseNumeric("1e3")).toBeNull();
	});
});

describe("lesson flow", () => {
	const base = {
		kind: "lesson" as const,
		objectiveCode: "MA-Y3-AS-MENTAL",
		prerequisiteCodes: ["MA-Y2-AS-MENTAL"],
		seed: "t",
	};

	it("runs diagnostic → instruction → guided → independent → complete", () => {
		let s = startLesson(base);
		expect(s.phase).toBe("diagnostic");
		expect(s.items).toHaveLength(LESSON_SIZES.diagnosticPrereq + LESSON_SIZES.diagnosticTarget);
		const phases = new Set<string>();
		while (s.phase !== "complete") {
			phases.add(s.phase);
			if (s.phase === "instruction") {
				expect(viewLesson(s).explanation?.length).toBeGreaterThan(0);
				s = continueToPractice(s);
				continue;
			}
			const item = currentItem(s);
			if (!item) throw new Error("no item");
			s = submitAnswer(s, item.answer).state;
		}
		expect([...phases]).toEqual(["diagnostic", "instruction", "guided", "independent"]);
		const modes = s.log.map((l) => l.mode);
		expect(modes.filter((m) => m === "guided")).toHaveLength(LESSON_SIZES.guided);
		expect(modes.filter((m) => m === "independent")).toHaveLength(LESSON_SIZES.independent);
	});

	it("never exposes the answer, hint or solution in the view", () => {
		const view = viewLesson(startLesson(base));
		expect(view.item).not.toHaveProperty("answer");
		expect(view.item).not.toHaveProperty("hint");
		expect(view.item).not.toHaveProperty("workedSolution");
	});

	it("refuses hints outside guided practice", () => {
		expect(() => requestHint(startLesson(base))).toThrow(LessonError);
	});

	it("flags weak prerequisites and includes a refresher in the explanation", () => {
		let s = startLesson(base);
		while (s.phase === "diagnostic") {
			const item = currentItem(s);
			if (!item) throw new Error("no item");
			s = submitAnswer(s, item.objectiveCode === "MA-Y2-AS-MENTAL" ? "-1" : item.answer).state;
		}
		expect(s.weakPrerequisites).toEqual(["MA-Y2-AS-MENTAL"]);
		expect(viewLesson(s).explanation?.[0]).toMatch(/reminder/);
	});

	it("gives worked solution on wrong guided answers and inserts prerequisite after two misses", () => {
		let s = startLesson(base);
		while (s.phase === "diagnostic") s = submitAnswer(s, currentItem(s)?.answer ?? "").state;
		s = continueToPractice(s);
		const r1 = submitAnswer(s, "-1");
		expect(r1.feedback?.correct).toBe(false);
		expect(r1.feedback?.workedSolution).toBeTruthy();
		const r2 = submitAnswer(r1.state, "-1");
		expect(currentItem(r2.state)?.objectiveCode).toBe("MA-Y2-AS-MENTAL");
	});

	it("records hints used in guided evidence", () => {
		let s = startLesson(base);
		while (s.phase === "diagnostic") s = submitAnswer(s, currentItem(s)?.answer ?? "").state;
		s = continueToPractice(s);
		s = requestHint(s).state;
		const { entry } = submitAnswer(s, currentItem(s)?.answer ?? "");
		expect(entry.hintsUsed).toBe(1);
	});

	it("gives no feedback during independent assessment", () => {
		let s = startLesson(base);
		while (s.phase !== "independent") {
			if (s.phase === "instruction") s = continueToPractice(s);
			else s = submitAnswer(s, currentItem(s)?.answer ?? "").state;
		}
		expect(viewLesson(s).canHint).toBe(false);
		expect(submitAnswer(s, "0").feedback).toBeNull();
	});

	it("review sessions contain only review evidence", () => {
		const s = answerAll(startLesson({ ...base, kind: "review" }), () => true);
		expect(s.log.every((l) => l.mode === "review")).toBe(true);
		expect(s.log).toHaveLength(LESSON_SIZES.review);
	});

	it("rejects answers once complete", () => {
		const s = answerAll(startLesson(base), () => true);
		expect(() => submitAnswer(s, "1")).toThrow(LessonError);
	});
});
