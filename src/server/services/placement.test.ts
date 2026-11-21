import { beforeEach, describe, expect, it } from "vitest";
import { type ProgrammeYear, programmeSteps } from "#/curriculum/programme";
import { createRng, pick, shuffle } from "#/curriculum/rng";
import type { CompetencyStatus, EvidenceMode, YearGroup } from "#/domain/types";
import { createMemoryStore } from "../store/memory-store";
import type { CompetencyRecord, DataStore, StudentRecord, TableName } from "../store/types";
import { formatPlacement, placeAllLearners, placeLearner, readOnlyStore } from "./placement";

let store: DataStore;
let student: StudentRecord;

async function addStudent(yearGroup: YearGroup, displayName = "Ada") {
	return store.students.create({
		familyId: "fam1",
		displayName,
		yearGroup,
		preferences: {} as StudentRecord["preferences"],
	});
}

async function addCompetency(
	objectiveCode: string,
	status: CompetencyStatus,
	extra: Partial<Pick<CompetencyRecord, "computedStatus" | "override">> = {},
	studentId = student.id,
) {
	return store.student_competencies.create({
		familyId: "fam1",
		studentId,
		objectiveCode,
		status,
		computedStatus: extra.computedStatus ?? status,
		reasons: [],
		securedAt: null,
		override: extra.override ?? null,
	});
}

async function addSession(objectiveCode: string, sessionId: string, mode: EvidenceMode, correct: number, items = 5) {
	for (let i = 0; i < items; i++) {
		await store.assessment_attempts.create({
			familyId: "fam1",
			studentId: student.id,
			objectiveCode,
			sessionId,
			mode,
			itemType: i % 2 === 0 ? "numeric" : "multiple_choice",
			prompt: "p",
			expected: "1",
			response: i < correct ? "1" : "0",
			correct: i < correct,
			hintsUsed: 0,
		});
	}
}

async function addReview(objectiveCode: string, dueAt: string, status: "pending" | "done" = "pending") {
	return store.revision_schedules.create({ familyId: "fam1", studentId: student.id, objectiveCode, dueAt, status });
}

async function snapshot() {
	const tables = Object.keys(store) as TableName[];
	return Object.fromEntries(await Promise.all(tables.map(async (t) => [t, await store[t].listAll({})])));
}

const y3 = programmeSteps(3).map((s) => s.objectiveCode);

beforeEach(async () => {
	store = createMemoryStore();
	student = await addStudent(3);
});

describe("placeLearner", () => {
	it("counts secure, mastered and parent overrides as done wherever they sit, in any row order", async () => {
		await addCompetency(y3[9] as string, "mastered");
		await addCompetency(y3[1] as string, "secure", {
			computedStatus: "not_started",
			override: { status: "secure", reason: "Already known", byUserId: "u1", at: "2026-10-01T00:00:00.000Z" },
		});
		await addCompetency(y3[0] as string, "secure");
		await addCompetency(y3[4] as string, "secure");

		const p = await placeLearner(readOnlyStore(store), student);

		expect(p.position?.current?.objectiveCode).toBe(y3[2]);
		expect(p.position?.steps.filter((s) => s.state === "done").map((s) => s.objectiveCode)).toEqual([
			y3[0],
			y3[1],
			y3[4],
			y3[9],
		]);
		expect(p.overrides).toEqual([{ objectiveCode: y3[1], status: "secure", reason: "Already known" }]);
		expect(p.doneAhead.map((e) => e.objectiveCode)).toEqual([y3[4], y3[9]]);
	});

	it("treats an override as authoritative even if the stored status disagrees", async () => {
		await addCompetency(y3[0] as string, "developing", {
			override: { status: "mastered", reason: "Tested at school", byUserId: "u1", at: "2026-10-01T00:00:00.000Z" },
		});
		const p = await placeLearner(readOnlyStore(store), student);
		expect(p.position?.steps[0]?.state).toBe("done");
	});

	it("keeps started-but-not-secure steps ahead locked with their evidence, then resumes them when reached", async () => {
		await addCompetency(y3[5] as string, "developing");
		await addSession(y3[5] as string, "s1", "guided", 4);
		await addSession(y3[5] as string, "s2", "independent", 2);
		await addSession(y3[5] as string, "s3", "independent", 3);

		const before = await placeLearner(readOnlyStore(store), student);
		expect(before.position?.current?.index).toBe(0);
		expect(before.position?.steps[5]?.state).toBe("locked");
		expect(before.position?.stuck).toBe(false);
		expect(before.evidenceAhead).toEqual([{ objectiveCode: y3[5], status: "developing", failedAssessments: 2 }]);

		for (const code of y3.slice(0, 5)) await addCompetency(code, "secure");
		const reached = await placeLearner(readOnlyStore(store), student);
		expect(reached.position?.current?.objectiveCode).toBe(y3[5]);
		expect(reached.position?.stuck).toBe(true);
		expect(reached.evidenceAhead).toEqual([]);
		expect(await store.assessment_attempts.listAll({ objectiveCode: y3[5] as string })).toHaveLength(15);
	});

	it("marks a needs_review step ahead of the position as to rework without moving the position", async () => {
		await addCompetency(y3[6] as string, "needs_review");
		const p = await placeLearner(readOnlyStore(store), student);
		expect(p.position?.current?.index).toBe(0);
		expect(p.position?.steps[6]?.state).toBe("to_rework");
	});

	it("reports pending reviews and leaves every schedule as it was", async () => {
		await addCompetency(y3[3] as string, "secure");
		await addReview(y3[3] as string, "2026-12-02T00:00:00.000Z");
		await addReview("MA-Y4-PV-ROUND", "2026-11-25T00:00:00.000Z");
		await addReview(y3[0] as string, "2026-11-01T00:00:00.000Z", "done");
		await addCompetency("MA-Y4-PV-ROUND", "secure");
		const before = await snapshot();

		const p = await placeLearner(readOnlyStore(store), student);

		expect(p.pendingReviews).toEqual([
			{ objectiveCode: "MA-Y4-PV-ROUND", dueAt: "2026-11-25T00:00:00.000Z", inProgramme: false },
			{ objectiveCode: y3[3], dueAt: "2026-12-02T00:00:00.000Z", inProgramme: true },
		]);
		expect(p.offProgramme).toEqual([{ objectiveCode: "MA-Y4-PV-ROUND", status: "secure" }]);
		expect(await snapshot()).toEqual(before);
	});

	it("reports a learner whose year has no programme without placing them", async () => {
		const y4 = await addStudent(4 as YearGroup, "Bo");
		await addCompetency("MA-Y4-PV-ROUND", "developing", {}, y4.id);
		const p = await placeLearner(readOnlyStore(store), y4);
		expect(p.position).toBeNull();
		expect(p.offProgramme).toEqual([{ objectiveCode: "MA-Y4-PV-ROUND", status: "developing" }]);
		expect(formatPlacement(p)).toContain("no programme for Y4");
	});
});

describe("random order histories", () => {
	const STATUSES: CompetencyStatus[] = ["not_started", "emerging", "developing", "secure", "mastered", "needs_review"];

	for (const year of [3, 5] as ProgrammeYear[]) {
		for (const seed of [1, 7, 42, 2026, 9001]) {
			it(`places a Y${year} learner consistently for seed ${seed}`, async () => {
				const rng = createRng(seed * 31 + year);
				const codes = programmeSteps(year).map((s) => s.objectiveCode);
				const statusOf = new Map(codes.map((c) => [c, pick(rng, STATUSES)]));
				const learner = await addStudent(year);
				for (const code of shuffle(rng, codes)) {
					const status = statusOf.get(code) as CompetencyStatus;
					if (status === "not_started" && rng() < 0.5) continue;
					const override =
						rng() < 0.2
							? { status: "secure" as const, reason: "known", byUserId: "u1", at: "2026-10-01T00:00:00.000Z" }
							: null;
					if (override) statusOf.set(code, "secure");
					await addCompetency(code, override ? "secure" : status, { override }, learner.id);
				}
				const before = await snapshot();

				const p = await placeLearner(readOnlyStore(store), learner);
				const position = p.position;
				if (!position) throw new Error("expected a programme position");

				for (const step of position.steps) {
					const status = statusOf.get(step.objectiveCode);
					if (status === "secure" || status === "mastered") expect(step.state).toBe("done");
					if (status === "needs_review") expect(step.state).toBe("to_rework");
				}
				const firstOpen = position.steps.findIndex((s) =>
					["not_started", "emerging", "developing"].includes(statusOf.get(s.objectiveCode) as string),
				);
				expect(position.current?.index ?? -1).toBe(firstOpen);
				expect(position.counts.current).toBe(firstOpen === -1 ? 0 : 1);
				for (const step of position.steps.slice(firstOpen + 1)) {
					if (firstOpen === -1) break;
					const status = statusOf.get(step.objectiveCode) as string;
					if (["not_started", "emerging", "developing"].includes(status)) expect(step.state).toBe("locked");
				}
				const { total, ...byState } = position.counts;
				expect(Object.values(byState).reduce((a, b) => a + b, 0)).toBe(total);

				const reordered = createMemoryStore();
				for (const row of shuffle(rng, await store.student_competencies.listAll({ studentId: learner.id }))) {
					const { id: _id, createdAt: _c, updatedAt: _u, ...data } = row;
					await reordered.student_competencies.create(data);
				}
				expect((await placeLearner(readOnlyStore(reordered), learner)).position).toEqual(position);
				expect(await snapshot()).toEqual(before);
			});
		}
	}
});

describe("readOnlyStore", () => {
	it("refuses every write on every table", async () => {
		const ro = readOnlyStore(store) as unknown as DataStore;
		for (const table of Object.keys(store) as TableName[]) {
			expect(() => ro[table].create({} as never)).toThrow(/read-only/);
			expect(() => ro[table].update("x", {})).toThrow(/read-only/);
			expect(() => ro[table].delete("x")).toThrow(/read-only/);
		}
		await expect(ro.students.listAll({})).resolves.toHaveLength(1);
	});
});

describe("placeAllLearners", () => {
	it("places every learner and formats a reviewable report", async () => {
		await addStudent(5, "Cy");
		await addCompetency(y3[0] as string, "secure");
		const placements = await placeAllLearners(readOnlyStore(store));
		expect(placements.map((p) => p.displayName)).toEqual(["Ada", "Cy"]);
		const report = formatPlacement(placements[0] as (typeof placements)[number]);
		expect(report).toContain(`position: step 2/${y3.length} ${y3[1]}`);
		expect(report).toContain(`${y3[0]}=done`);
	});
});
