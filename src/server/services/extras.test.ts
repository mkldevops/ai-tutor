import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { programmeSteps } from "#/curriculum/programme";
import { currentItem, LESSON_SIZES } from "#/learning-engine/lesson";
import { createMemoryStore } from "../store/memory-store";
import type { DataStore } from "../store/types";
import { deleteStudent } from "./deletion";
import { type Actor, createFamilyForUser, createStudent, exportStudentData } from "./family";
import { answerSession, continueSession, recomputeCompetency, type SessionResponse, startSession } from "./learning";
import { getMission } from "./mission";
import { placeAt } from "./programme-fixtures";
import { getProgrammeReport } from "./programme-report";
import { DEFAULT_RETENTION, purgeExpiredData } from "./retention";

const DAY = 86_400_000;
const NOW = new Date("2026-11-22T09:00:00.000Z");
const [FIRST, SECOND, THIRD] = programmeSteps(3).map((s) => s.objectiveCode) as [string, string, string];
const prefs = { readingSupport: false, theme: "calm" as const };

describe("extra practice sessions", () => {
	let store: DataStore;
	let alice: Actor;
	let sam: string;
	const deps = (days = 0) => ({ store, now: () => new Date(NOW.getTime() + days * DAY) });
	const extra = (objectiveCode: string, days = 0) =>
		startSession(deps(days), alice, { studentId: sam, objectiveCode, kind: "extra" });

	async function finish(start: SessionResponse, correct = true, days = 0) {
		let res = start;
		while (res.view.phase !== "complete") {
			if (res.view.phase === "instruction") {
				res = await continueSession(deps(days), alice, res.sessionId);
				continue;
			}
			const session = await store.learning_sessions.get(res.sessionId);
			const item = currentItem(session?.state as NonNullable<typeof session>["state"]);
			res = await answerSession(deps(days), alice, res.sessionId, correct ? (item?.answer ?? "") : "999999");
		}
		return res;
	}

	const competency = async (objectiveCode: string) =>
		(await store.student_competencies.listAll({ studentId: sam, objectiveCode }))[0] ?? null;

	beforeEach(async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(NOW);
		store = createMemoryStore();
		alice = await createFamilyForUser(store, "user-alice", "Alice family");
		sam = (await createStudent(store, alice, { displayName: "Sam", yearGroup: 3, preferences: prefs })).id;
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("runs guided practice only and stores every attempt as guided", async () => {
		const start = await extra(FIRST);
		expect(start.view.kind).toBe("extra");
		expect(start.view.phase).toBe("guided");
		const done = await finish(start);
		const attempts = await store.assessment_attempts.listAll({ sessionId: done.sessionId });
		expect(attempts).toHaveLength(LESSON_SIZES.guided);
		expect(attempts.every((a) => a.mode === "guided" && a.objectiveCode === FIRST)).toBe(true);
	});

	it("never makes the current step secure, however many extras are done", async () => {
		for (let i = 0; i < 4; i++) await finish(await extra(FIRST, i));
		const status = (await competency(FIRST))?.status ?? "not_started";
		expect(status).not.toBe("secure");
		const mission = await getMission(deps(4), alice, sam);
		expect(mission).toMatchObject({ reason: "current", objectiveCode: FIRST, sessionKind: "lesson" });
	});

	it("still cannot secure a step once its guided evidence is folded into a recompute", async () => {
		for (let i = 0; i < 4; i++) await finish(await extra(FIRST, i));
		await recomputeCompetency(deps(4), alice.familyId, sam, FIRST, new Date(NOW.getTime() + 4 * DAY));
		expect(["secure", "mastered"]).not.toContain((await competency(FIRST))?.status);
		expect(await getMission(deps(4), alice, sam)).toMatchObject({ reason: "current", objectiveCode: FIRST });

		const lesson = await startSession(deps(4), alice, { studentId: sam, objectiveCode: FIRST, kind: "lesson" });
		await finish(lesson, true, 4);
		expect((await competency(FIRST))?.status).toBe("secure");
	});

	it("does not undo a step secured by a real lesson when its evidence is recomputed", async () => {
		await finish(await startSession(deps(), alice, { studentId: sam, objectiveCode: FIRST, kind: "lesson" }));
		const before = await competency(FIRST);
		expect(before?.status).toBe("secure");
		const pending = await store.revision_schedules.listAll({ studentId: sam, status: "pending" });
		await finish(await extra(FIRST, 1), false, 1);
		await recomputeCompetency(deps(1), alice.familyId, sam, FIRST, new Date(NOW.getTime() + DAY));
		const after = await competency(FIRST);
		expect(after?.status).toBe("secure");
		expect(after?.securedAt).toBe(before?.securedAt);
		expect(await store.revision_schedules.listAll({ studentId: sam, status: "pending" })).toEqual(pending);
		expect(await getMission(deps(1), alice, sam)).toMatchObject({ reason: "current", objectiveCode: SECOND });
	});

	it("leaves a secure reached step, its review and the path position untouched", async () => {
		await placeAt(store, sam, SECOND);
		const before = await competency(FIRST);
		const reviewsBefore = await store.revision_schedules.listAll({ studentId: sam });
		await finish(await extra(FIRST), false);
		await finish(await extra(FIRST), true);
		expect(await competency(FIRST)).toEqual(before);
		expect(await store.revision_schedules.listAll({ studentId: sam })).toEqual(reviewsBefore);
		expect(await store.mastery_events.listAll({ studentId: sam })).toHaveLength(0);
		const mission = await getMission(deps(), alice, sam);
		expect(mission).toMatchObject({ reason: "current", objectiveCode: SECOND });
	});

	it("refuses a locked step and an objective off the programme, and audits the attempt", async () => {
		await expect(extra(SECOND)).rejects.toMatchObject({ code: "off_programme" });
		await placeAt(store, sam, SECOND);
		await expect(extra(THIRD)).rejects.toMatchObject({ code: "off_programme" });
		await expect(extra("MA-Y5-MD-POWERS10")).rejects.toMatchObject({ code: "invalid" });
		expect(await store.learning_sessions.listAll({ studentId: sam })).toHaveLength(0);
		const audits = (await store.audit_logs.listAll({ familyId: alice.familyId })).filter(
			(a) => a.action === "session.off_programme",
		);
		expect(audits.map((a) => (a.detail as { kind: string }).kind)).toEqual(["extra", "extra"]);
	});

	it("does not take over the mission while open, nor open the path to other lessons", async () => {
		const open = await extra(FIRST);
		const mission = await getMission(deps(), alice, sam);
		expect(mission).toMatchObject({ reason: "current", objectiveCode: FIRST, sessionKind: "lesson", sessionId: null });
		const lesson = await startSession(deps(), alice, { studentId: sam, objectiveCode: FIRST, kind: "lesson" });
		expect(lesson.sessionId).not.toBe(open.sessionId);
		expect(lesson.view.phase).toBe("diagnostic");
		await expect(
			startSession(deps(), alice, { studentId: sam, objectiveCode: SECOND, kind: "lesson" }),
		).rejects.toMatchObject({ code: "off_programme" });
		expect((await extra(FIRST)).sessionId).toBe(open.sessionId);
	});

	it("is left out of the missions-this-week count", async () => {
		await finish(await extra(FIRST));
		const report = await getProgrammeReport(deps(), alice, sam);
		expect(report.missionsLast7Days).toBe(0);
	});

	it("is exported and deleted with the learner", async () => {
		const done = await finish(await extra(FIRST));
		const data = (await exportStudentData(store, alice, sam)) as Record<string, { id: string; sessionId?: string }[]>;
		expect(data.learning_sessions?.map((s) => s.id)).toContain(done.sessionId);
		expect(data.assessment_attempts?.filter((a) => a.sessionId === done.sessionId)).toHaveLength(LESSON_SIZES.guided);

		await deleteStudent(store, alice, sam, "Sam");
		expect(await store.learning_sessions.get(done.sessionId)).toBeNull();
		expect(await store.assessment_attempts.listAll({ sessionId: done.sessionId })).toHaveLength(0);
	});

	it("is purged by the retention sweeps like any other session", async () => {
		const done = await finish(await extra(FIRST));
		const abandoned = await extra(FIRST);
		const later = new Date(NOW.getTime() + 40 * DAY);
		vi.setSystemTime(later);
		await purgeExpiredData({ store }, DEFAULT_RETENTION, { dryRun: false, now: later });
		expect(await store.learning_sessions.get(abandoned.sessionId)).toBeNull();
		expect(await store.learning_sessions.get(done.sessionId)).not.toBeNull();

		await purgeExpiredData({ store }, { ...DEFAULT_RETENTION, evidenceDays: 30 }, { dryRun: false, now: later });
		expect(await store.learning_sessions.listAll({ studentId: sam })).toHaveLength(0);
		expect(await store.assessment_attempts.listAll({ studentId: sam })).toHaveLength(0);
	});
});
