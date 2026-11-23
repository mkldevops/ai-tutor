import { beforeEach, describe, expect, it } from "vitest";
import { programmeSteps } from "#/curriculum/programme";
import { createMemoryStore } from "../store/memory-store";
import type { DataStore } from "../store/types";
import { type Actor, createFamilyForUser, createStudent } from "./family";
import { overrideCompetency, startSession } from "./learning";
import { getMission } from "./mission";
import {
	MAX_PROGRAMME_SKIPS,
	setDailyNewStepCap,
	setProgrammePaused,
	skipProgrammeStep,
	undoProgrammeSkip,
} from "./programme-controls";
import { openLegacySession, placeAt } from "./programme-fixtures";
import { getProgrammeReport } from "./programme-report";
import { programmeSettingsOf } from "./programme-settings";

const NOW = new Date("2026-11-22T10:00:00.000Z");
const prefs = { readingSupport: false, theme: "calm" as const };
const STEPS = programmeSteps(3).map((s) => s.objectiveCode);
const [FIRST, SECOND, THIRD] = STEPS as [string, string, string];

describe("programme controls", () => {
	let store: DataStore;
	let alice: Actor;
	let sam: string;
	const deps = () => ({ store, now: () => NOW });
	const actions = async () =>
		(await store.audit_logs.listAll({ familyId: alice.familyId }))
			.filter((l) => l.action.startsWith("programme."))
			.map((l) => ({ action: l.action, detail: l.detail }));

	beforeEach(async () => {
		store = createMemoryStore();
		alice = await createFamilyForUser(store, "user-alice", "Alice family");
		sam = (await createStudent(store, alice, { displayName: "Sam", yearGroup: 3, preferences: prefs })).id;
	});

	it("pauses and resumes the course, audits each change and keeps extras open", async () => {
		await setProgrammePaused(deps(), alice, sam, true);
		expect(await getMission(deps(), alice, sam)).toMatchObject({ reason: "paused", objective: null });
		await expect(
			startSession(deps(), alice, { studentId: sam, objectiveCode: FIRST, kind: "lesson" }),
		).rejects.toMatchObject({ code: "paused" });
		const extra = await startSession(deps(), alice, { studentId: sam, objectiveCode: FIRST, kind: "extra" });
		expect(extra.objective.code).toBe(FIRST);

		await setProgrammePaused(deps(), alice, sam, true);
		await setProgrammePaused(deps(), alice, sam, false);
		expect(await getMission(deps(), alice, sam)).toMatchObject({ reason: "current", objectiveCode: FIRST });
		expect((await actions()).map((a) => a.action)).toEqual(["programme.pause", "programme.resume"]);
	});

	it("holds the next new step until tomorrow once a step was secured today, only when the cap is on", async () => {
		await store.student_competencies.create({
			familyId: alice.familyId,
			studentId: sam,
			objectiveCode: FIRST,
			status: "secure",
			computedStatus: "secure",
			reasons: [],
			securedAt: new Date(NOW.getTime() - 3_600_000).toISOString(),
			override: null,
		});
		expect(await getMission(deps(), alice, sam)).toMatchObject({ reason: "current", objectiveCode: SECOND });

		await setDailyNewStepCap(deps(), alice, sam, true);
		await setDailyNewStepCap(deps(), alice, sam, true);
		expect(programmeSettingsOf((await store.students.get(sam))!).dailyNewStepCap).toBe(true);
		expect(await getMission(deps(), alice, sam)).toMatchObject({ reason: "done_for_today", objective: null });
		await expect(
			startSession(deps(), alice, { studentId: sam, objectiveCode: SECOND, kind: "lesson" }),
		).rejects.toMatchObject({
			code: "off_programme",
			message: "Today's new step is done. The next one opens tomorrow.",
		});
		const extra = await startSession(deps(), alice, { studentId: sam, objectiveCode: FIRST, kind: "extra" });
		expect(extra.objective.code).toBe(FIRST);

		const tomorrow = { store, now: () => new Date("2026-11-23T00:05:00.000Z") };
		expect(await getMission(tomorrow, alice, sam)).toMatchObject({ reason: "current", objectiveCode: SECOND });
		const lesson = await startSession(tomorrow, alice, { studentId: sam, objectiveCode: SECOND, kind: "lesson" });
		expect(lesson.objective.code).toBe(SECOND);

		await setDailyNewStepCap(deps(), alice, sam, false);
		expect((await actions()).map((a) => a.action)).toEqual(["programme.daily_cap_on", "programme.daily_cap_off"]);
	});

	it("refuses to resume a paused open lesson", async () => {
		await openLegacySession(store, sam, FIRST);
		await setProgrammePaused(deps(), alice, sam, true);
		await expect(
			startSession(deps(), alice, { studentId: sam, objectiveCode: FIRST, kind: "lesson" }),
		).rejects.toMatchObject({ code: "paused" });
	});

	it("skips the current step with a reason, shows it as skipped not acquired, and undo restores the position", async () => {
		await skipProgrammeStep(deps(), alice, { studentId: sam, objectiveCode: FIRST, reason: "  Done at school  " });

		expect(programmeSettingsOf((await store.students.get(sam))!).skips).toEqual([
			{ objectiveCode: FIRST, reason: "Done at school", byUserId: alice.userId, at: NOW.toISOString() },
		]);
		expect(await getMission(deps(), alice, sam)).toMatchObject({ reason: "current", objectiveCode: SECOND });
		const report = await getProgrammeReport(deps(), alice, sam);
		expect(report.position.step?.code).toBe(SECOND);
		expect(report.position.done).toBe(0);
		expect(report.acquired).toEqual([]);
		expect(report.skipped).toMatchObject([{ code: FIRST, reason: "Done at school", at: NOW.toISOString() }]);
		expect(report.next.map((s) => s.code)).not.toContain(FIRST);

		await undoProgrammeSkip(deps(), alice, { studentId: sam, objectiveCode: FIRST });
		expect(await getMission(deps(), alice, sam)).toMatchObject({ reason: "current", objectiveCode: FIRST });
		expect((await getProgrammeReport(deps(), alice, sam)).skipped).toEqual([]);
		expect(await actions()).toEqual([
			{ action: "programme.skip", detail: { objectiveCode: FIRST, reason: "Done at school" } },
			{ action: "programme.skip_undo", detail: { objectiveCode: FIRST, skippedAt: NOW.toISOString() } },
		]);
	});

	it("moves past a started lesson when its step is skipped and returns to it on undo", async () => {
		const open = await openLegacySession(store, sam, FIRST);
		expect(await getMission(deps(), alice, sam)).toMatchObject({ reason: "continue", sessionId: open.id });

		await skipProgrammeStep(deps(), alice, { studentId: sam, objectiveCode: FIRST, reason: "Stuck for a week" });
		expect(await getMission(deps(), alice, sam)).toMatchObject({ reason: "current", objectiveCode: SECOND });

		await undoProgrammeSkip(deps(), alice, { studentId: sam, objectiveCode: FIRST });
		expect(await getMission(deps(), alice, sam)).toMatchObject({ reason: "continue", sessionId: open.id });
	});

	it("only skips the current step, once, with a reason", async () => {
		await expect(
			skipProgrammeStep(deps(), alice, { studentId: sam, objectiveCode: THIRD, reason: "Too easy" }),
		).rejects.toMatchObject({ code: "invalid" });
		await expect(
			skipProgrammeStep(deps(), alice, { studentId: sam, objectiveCode: FIRST, reason: "   " }),
		).rejects.toMatchObject({ code: "invalid" });
		await expect(
			skipProgrammeStep(deps(), alice, { studentId: sam, objectiveCode: FIRST, reason: "x".repeat(201) }),
		).rejects.toMatchObject({ code: "invalid" });
		await skipProgrammeStep(deps(), alice, { studentId: sam, objectiveCode: FIRST, reason: "Known" });
		await expect(
			skipProgrammeStep(deps(), alice, { studentId: sam, objectiveCode: FIRST, reason: "Known" }),
		).rejects.toMatchObject({ code: "conflict" });
		await expect(undoProgrammeSkip(deps(), alice, { studentId: sam, objectiveCode: SECOND })).rejects.toMatchObject({
			code: "invalid",
		});
	});

	it("caps the number of skips", async () => {
		const skips = Array.from({ length: MAX_PROGRAMME_SKIPS }, (_, i) => ({
			objectiveCode: `X-${i}`,
			reason: "seed",
			byUserId: alice.userId,
			at: NOW.toISOString(),
		}));
		await store.students.update(sam, { programme: { paused: false, skips, paceTarget: 4, dailyNewStepCap: false } });
		await expect(
			skipProgrammeStep(deps(), alice, { studentId: sam, objectiveCode: FIRST, reason: "Known" }),
		).rejects.toMatchObject({ code: "invalid" });
	});

	it("lists a skipped step marked already known as acquired only", async () => {
		await skipProgrammeStep(deps(), alice, { studentId: sam, objectiveCode: FIRST, reason: "Known" });
		await overrideCompetency(deps(), alice, {
			studentId: sam,
			objectiveCode: FIRST,
			status: "secure",
			reason: "Already known",
		});
		const report = await getProgrammeReport(deps(), alice, sam);
		expect(report.acquired.map((s) => s.code)).toEqual([FIRST]);
		expect(report.skipped).toEqual([]);
	});

	it("marks the current step already known through the competency override", async () => {
		await placeAt(store, sam, SECOND);
		await overrideCompetency(deps(), alice, {
			studentId: sam,
			objectiveCode: SECOND,
			status: "secure",
			reason: "Already known",
		});
		expect(await getMission(deps(), alice, sam)).toMatchObject({ reason: "current", objectiveCode: THIRD });
		const logs = await store.audit_logs.listAll({ familyId: alice.familyId, action: "competency.override" });
		expect(logs).toHaveLength(1);
	});
});
