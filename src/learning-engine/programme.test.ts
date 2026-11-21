import { describe, expect, it } from "vitest";
import { programmeSteps } from "#/curriculum/programme";
import type { CompetencyStatus } from "#/domain/types";
import type { SessionSummary } from "./mastery";
import { countFailedAssessments, programmePosition, type StepCompetency } from "./programme";

const sequence = programmeSteps(3);
const codes = sequence.map((s) => s.objectiveCode);

function competencies(
	statuses: Record<number, CompetencyStatus>,
	failed: Record<number, number> = {},
): StepCompetency[] {
	return codes.map((objectiveCode, i) => ({
		objectiveCode,
		status: statuses[i] ?? "not_started",
		failedAssessments: failed[i] ?? 0,
	}));
}

const states = (p: ReturnType<typeof programmePosition>) => p.steps.map((s) => s.state);

describe("programmePosition", () => {
	it("puts a new learner on the first step with everything else locked", () => {
		const p = programmePosition(sequence, []);
		expect(p.current?.objectiveCode).toBe("EN-Y3-SP-PREFIXES");
		expect(p.currentUnit).toEqual({ id: "Y3-U1", index: 0, subject: "english" });
		expect(states(p)).toEqual(["current", ...Array(codes.length - 1).fill("locked")]);
		expect(p.counts).toMatchObject({ done: 0, current: 1, locked: codes.length - 1, total: codes.length });
		expect(p.complete).toBe(false);
		expect(p.stuck).toBe(false);
	});

	it("stays inside a unit until its steps are secure", () => {
		const p = programmePosition(sequence, competencies({ 0: "secure", 1: "developing" }));
		expect(states(p).slice(0, 3)).toEqual(["done", "current", "locked"]);
		expect(p.current?.objectiveCode).toBe("EN-Y3-GR-A-AN");
		expect(p.currentUnit?.id).toBe("Y3-U1");
	});

	it("does not advance on guided progress alone", () => {
		const p = programmePosition(sequence, competencies({ 0: "developing" }));
		expect(p.current?.index).toBe(0);
	});

	it("moves from the English unit to the maths unit once the English steps are secure or mastered", () => {
		const p = programmePosition(sequence, competencies({ 0: "mastered", 1: "secure" }));
		expect(p.current?.objectiveCode).toBe("MA-Y3-PV-DIGIT-VALUE");
		expect(p.currentUnit).toEqual({ id: "Y3-U2", index: 1, subject: "maths" });
		expect(p.counts.done).toBe(2);
	});

	it("marks an earlier step that needs review as to rework without moving the path back", () => {
		const p = programmePosition(sequence, competencies({ 0: "needs_review", 1: "secure", 2: "emerging" }));
		expect(states(p).slice(0, 4)).toEqual(["to_rework", "done", "current", "locked"]);
		expect(p.current?.index).toBe(2);
		expect(p.counts.to_rework).toBe(1);
	});

	it("passes over a skipped step and counts it apart", () => {
		const p = programmePosition(sequence, competencies({ 0: "secure" }), ["EN-Y3-GR-A-AN"]);
		expect(states(p).slice(0, 3)).toEqual(["done", "skipped", "current"]);
		expect(p.current?.objectiveCode).toBe("MA-Y3-PV-DIGIT-VALUE");
		expect(p.counts).toMatchObject({ done: 1, skipped: 1 });
	});

	it("reports a step acquired before the skip as done rather than skipped", () => {
		const p = programmePosition(sequence, competencies({ 0: "secure" }), ["EN-Y3-SP-PREFIXES"]);
		expect(p.steps[0]?.state).toBe("done");
	});

	it("keeps steps known ahead of the current one as done", () => {
		const p = programmePosition(sequence, competencies({ 0: "secure", 3: "secure" }));
		expect(states(p).slice(0, 5)).toEqual(["done", "current", "locked", "done", "locked"]);
	});

	it("flags the current step as stuck after two failed independent assessments", () => {
		expect(programmePosition(sequence, competencies({ 0: "developing" }, { 0: 1 })).stuck).toBe(false);
		const p = programmePosition(sequence, competencies({ 0: "developing" }, { 0: 2 }));
		expect(p.stuck).toBe(true);
		expect(p.current?.index).toBe(0);
	});

	it("ignores failed assessments on steps that are not current", () => {
		const p = programmePosition(sequence, competencies({ 0: "needs_review", 1: "developing" }, { 0: 3 }));
		expect(p.current?.index).toBe(1);
		expect(p.stuck).toBe(false);
	});

	it("reports the programme complete when every step is done or skipped", () => {
		const all = Object.fromEntries(codes.slice(0, -1).map((_, i) => [i, "secure" as CompetencyStatus]));
		const p = programmePosition(sequence, competencies(all), [codes.at(-1) as string]);
		expect(p.complete).toBe(true);
		expect(p.current).toBeNull();
		expect(p.currentUnit).toBeNull();
		expect(p.stuck).toBe(false);
		expect(p.counts).toMatchObject({ done: codes.length - 1, skipped: 1, current: 0, locked: 0 });
	});
});

describe("countFailedAssessments", () => {
	const session = (mode: SessionSummary["mode"], accuracy: number, at: string): SessionSummary => ({
		sessionId: at,
		mode,
		items: 5,
		correct: Math.round(accuracy * 5),
		accuracy,
		itemTypes: 2,
		hintsUsed: 0,
		completedAt: at,
	});

	it("counts failed independent assessments since the last pass", () => {
		expect(
			countFailedAssessments([
				session("independent", 0.4, "1"),
				session("independent", 1, "2"),
				session("guided", 0.2, "3"),
				session("independent", 0.6, "4"),
				session("independent", 0.4, "5"),
			]),
		).toBe(2);
		expect(countFailedAssessments([session("guided", 0.2, "1")])).toBe(0);
	});
});
