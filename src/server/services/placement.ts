import { PROGRAMME_BY_YEAR, type ProgrammeYear, programmeSteps } from "#/curriculum/programme";
import type { CompetencyStatus } from "#/domain/types";
import { summariseSessions } from "#/learning-engine/mastery";
import { countFailedAssessments, type ProgrammePosition, programmePosition } from "#/learning-engine/programme";
import type { BaseRecord, DataStore, StudentRecord, Table, TableMap, TableName } from "../store/types";

export type ReadOnlyTable<T extends BaseRecord> = Pick<Table<T>, "get" | "list" | "listAll" | "listLatest">;
export type ReadOnlyStore = { [K in TableName]: ReadOnlyTable<TableMap[K]> };

const WRITES = new Set(["create", "update", "delete"]);

export function readOnlyStore(store: DataStore): ReadOnlyStore {
	return Object.fromEntries(
		Object.entries(store).map(([name, table]) => [
			name,
			new Proxy(table, {
				get(target, prop, receiver) {
					if (typeof prop === "string" && WRITES.has(prop)) {
						return () => {
							throw new Error(`Placement is read-only: refused ${name}.${prop}`);
						};
					}
					const value = Reflect.get(target, prop, receiver);
					return typeof value === "function" ? value.bind(target) : value;
				},
			}),
		]),
	) as unknown as ReadOnlyStore;
}

type StatusEntry = { objectiveCode: string; status: CompetencyStatus };

export type LearnerPlacement = {
	studentId: string;
	familyId: string;
	displayName: string;
	yearGroup: number;
	position: ProgrammePosition | null;
	overrides: (StatusEntry & { reason: string })[];
	doneAhead: StatusEntry[];
	evidenceAhead: (StatusEntry & { failedAssessments: number })[];
	pendingReviews: { objectiveCode: string; dueAt: string; inProgramme: boolean }[];
	offProgramme: StatusEntry[];
};

const isProgrammeYear = (year: number): year is ProgrammeYear => year in PROGRAMME_BY_YEAR;

export async function placeLearner(store: ReadOnlyStore, student: StudentRecord): Promise<LearnerPlacement> {
	const [competencies, attempts, reviews] = await Promise.all([
		store.student_competencies.listAll({ studentId: student.id }),
		store.assessment_attempts.listAll({ studentId: student.id }),
		store.revision_schedules.listAll({ studentId: student.id, status: "pending" }),
	]);
	const sequence = isProgrammeYear(student.yearGroup) ? programmeSteps(student.yearGroup) : [];
	const inSequence = new Set(sequence.map((s) => s.objectiveCode));

	const failedByCode = new Map<string, number>();
	for (const code of new Set(attempts.map((a) => a.objectiveCode))) {
		failedByCode.set(code, countFailedAssessments(summariseSessions(attempts.filter((a) => a.objectiveCode === code))));
	}
	const stepCompetencies = competencies.map((c) => ({
		objectiveCode: c.objectiveCode,
		status: c.override?.status ?? c.status,
		failedAssessments: failedByCode.get(c.objectiveCode) ?? 0,
	}));

	const position = sequence.length > 0 ? programmePosition(sequence, stepCompetencies) : null;
	const statusOf = new Map(stepCompetencies.map((c) => [c.objectiveCode, c.status]));
	const currentIndex = position?.current?.index ?? Number.POSITIVE_INFINITY;
	const ahead = (position?.steps ?? []).filter((s) => s.index > currentIndex);
	const entry = (objectiveCode: string): StatusEntry => ({
		objectiveCode,
		status: statusOf.get(objectiveCode) ?? "not_started",
	});

	return {
		studentId: student.id,
		familyId: student.familyId,
		displayName: student.displayName,
		yearGroup: student.yearGroup,
		position,
		overrides: competencies.flatMap((c) =>
			c.override ? [{ objectiveCode: c.objectiveCode, status: c.override.status, reason: c.override.reason }] : [],
		),
		doneAhead: ahead.filter((s) => s.state === "done").map((s) => entry(s.objectiveCode)),
		evidenceAhead: ahead
			.filter(
				(s) => s.state === "locked" && statusOf.has(s.objectiveCode) && statusOf.get(s.objectiveCode) !== "not_started",
			)
			.map((s) => ({ ...entry(s.objectiveCode), failedAssessments: failedByCode.get(s.objectiveCode) ?? 0 })),
		pendingReviews: reviews
			.map((r) => ({ objectiveCode: r.objectiveCode, dueAt: r.dueAt, inProgramme: inSequence.has(r.objectiveCode) }))
			.sort((a, b) => a.dueAt.localeCompare(b.dueAt)),
		offProgramme: stepCompetencies
			.filter((c) => !inSequence.has(c.objectiveCode))
			.map((c) => ({ objectiveCode: c.objectiveCode, status: c.status })),
	};
}

export async function placeAllLearners(store: ReadOnlyStore): Promise<LearnerPlacement[]> {
	const students = await store.students.listAll({});
	const placements: LearnerPlacement[] = [];
	for (const student of students) placements.push(await placeLearner(store, student));
	return placements;
}

const list = (items: string[]) => (items.length > 0 ? items.join(", ") : "none");

export function formatPlacement(p: LearnerPlacement): string {
	const header = `${p.displayName} (student ${p.studentId}, family ${p.familyId}, Y${p.yearGroup})`;
	if (!p.position) {
		return [header, `  no programme for Y${p.yearGroup}; ${p.offProgramme.length} competencies left untouched`].join(
			"\n",
		);
	}
	const { position } = p;
	const c = position.counts;
	const where = position.current
		? `step ${position.current.index + 1}/${c.total} ${position.current.objectiveCode} (unit ${position.current.unitId}, ${position.current.subject})${position.stuck ? " STUCK" : ""}`
		: "programme complete";
	return [
		header,
		`  position: ${where}`,
		`  counts: done ${c.done}, to_rework ${c.to_rework}, skipped ${c.skipped}, current ${c.current}, locked ${c.locked}`,
		`  path: ${position.steps.map((s) => `${s.objectiveCode}=${s.state}`).join(" ")}`,
		`  done ahead of position: ${list(p.doneAhead.map((e) => `${e.objectiveCode}(${e.status})`))}`,
		`  evidence kept, locked until reached: ${list(p.evidenceAhead.map((e) => `${e.objectiveCode}(${e.status}, failed ${e.failedAssessments})`))}`,
		`  parent overrides: ${list(p.overrides.map((o) => `${o.objectiveCode}=${o.status}`))}`,
		`  pending reviews kept: ${list(p.pendingReviews.map((r) => `${r.objectiveCode}@${r.dueAt.slice(0, 10)}${r.inProgramme ? "" : "(off-programme)"}`))}`,
		`  off-programme competencies: ${list(p.offProgramme.map((e) => `${e.objectiveCode}(${e.status})`))}`,
	].join("\n");
}
