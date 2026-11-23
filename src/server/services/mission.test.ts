import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PROGRAMME_BY_YEAR, programmeSteps } from "#/curriculum/programme";
import { currentItem } from "#/learning-engine/lesson";
import { isActiveMission } from "#/learning-engine/mission";
import { createMemoryStore } from "../store/memory-store";
import type { DataStore } from "../store/types";
import type { AppError } from "./errors";
import { type Actor, createFamilyForUser, createStudent } from "./family";
import {
	allowedObjectives,
	answerSession,
	continueSession,
	getSession,
	overrideCompetency,
	startSession,
} from "./learning";
import { getMission } from "./mission";
import { openLegacySession, placeAt } from "./programme-fixtures";

const DAY = 86_400_000;
const NOW = new Date("2026-11-21T12:00:00.000Z");
const prefs = { readingSupport: false, theme: "calm" as const };

async function completeLesson(store: DataStore, actor: Actor, studentId: string, objectiveCode: string) {
	let res = await startSession({ store, now: () => NOW }, actor, { studentId, objectiveCode, kind: "lesson" });
	while (res.view.phase !== "complete") {
		if (res.view.phase === "instruction") {
			res = await continueSession({ store }, actor, res.sessionId);
			continue;
		}
		const session = await store.learning_sessions.get(res.sessionId);
		const item = currentItem(session?.state as NonNullable<typeof session>["state"]);
		res = await answerSession({ store }, actor, res.sessionId, item?.answer ?? "");
	}
	return res;
}

describe("getMission", () => {
	let store: DataStore;
	let alice: Actor;
	const at = (ms: number) => ({ store, now: () => new Date(NOW.getTime() + ms) });

	beforeEach(async () => {
		vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
		store = createMemoryStore();
		alice = await createFamilyForUser(store, "user-alice", "Alice family");
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	const addLearner = async (name: string, yearGroup: 3 | 5 = 3) =>
		(await createStudent(store, alice, { displayName: name, yearGroup, preferences: prefs })).id;

	it("keeps every programme step within the objectives a learner may start", () => {
		for (const year of [3, 5] as const) {
			const allowed = allowedObjectives(year);
			for (const step of programmeSteps(year)) expect(allowed).toContain(step.objectiveCode);
		}
	});

	it("starts a new learner on the first programme step", async () => {
		const sam = await addLearner("Sam");
		expect(await getMission(at(0), alice, sam)).toMatchObject({
			reason: "current",
			objectiveCode: "EN-Y3-SP-PREFIXES",
			sessionKind: "lesson",
			objective: { code: "EN-Y3-SP-PREFIXES", subject: "english" },
		});
	});

	it("gives the same mission whatever subject was last used", async () => {
		const maths = await addLearner("Maths fan");
		const english = await addLearner("Reader");
		await openLegacySession(store, maths, "MA-Y3-AS-MENTAL");
		await openLegacySession(store, english, "EN-Y3-GR-PRESENT-PERFECT");
		await completeLesson(store, alice, maths, "MA-Y3-AS-MENTAL");
		await completeLesson(store, alice, english, "EN-Y3-GR-PRESENT-PERFECT");
		const { course: _a, ...a } = await getMission(at(0), alice, maths);
		const { course: _b, ...b } = await getMission(at(0), alice, english);
		expect(a).toEqual(b);
		expect(a).toMatchObject({ reason: "current", objectiveCode: "EN-Y3-SP-PREFIXES" });
	});

	it("resumes an open session, then forgets it once expired", async () => {
		const sam = await addLearner("Sam");
		const open = await openLegacySession(store, sam, "MA-Y3-AS-MENTAL");
		expect(await getMission(at(DAY), alice, sam)).toMatchObject({
			reason: "continue",
			sessionId: open.id,
			objectiveCode: "MA-Y3-AS-MENTAL",
		});
		expect(await getMission(at(15 * DAY), alice, sam)).toMatchObject({
			reason: "current",
			objectiveCode: "EN-Y3-SP-PREFIXES",
		});
	});

	it("returns a due review that the learner can start", async () => {
		const sam = await addLearner("Sam");
		await completeLesson(store, alice, sam, "EN-Y3-SP-PREFIXES");
		expect(await getMission(at(DAY), alice, sam)).toMatchObject({ reason: "current", objectiveCode: "EN-Y3-GR-A-AN" });
		const later = at(8 * DAY);
		const mission = await getMission(later, alice, sam);
		expect(mission).toMatchObject({ reason: "review", objectiveCode: "EN-Y3-SP-PREFIXES", sessionKind: "review" });
		if (!isActiveMission(mission)) throw new Error("unexpected");
		const started = await startSession(later, alice, {
			studentId: sam,
			objectiveCode: mission.objectiveCode,
			kind: mission.sessionKind,
		});
		expect((await getSession(later, alice, started.sessionId)).objective.code).toBe("EN-Y3-SP-PREFIXES");
	});

	it("refuses a third review in a row and accepts it again after a lesson", async () => {
		const sam = await addLearner("Sam");
		const steps = programmeSteps(3)
			.map((s) => s.objectiveCode)
			.slice(0, 4);
		await placeAt(store, sam, steps[3] as string);
		for (const [i, code] of steps.slice(0, 3).entries()) {
			await store.revision_schedules.create({
				familyId: alice.familyId,
				studentId: sam,
				objectiveCode: code,
				dueAt: new Date(NOW.getTime() - (5 - i) * DAY).toISOString(),
				status: "pending",
			});
		}
		const finished = async (kind: "lesson" | "review", objectiveCode: string, minutes: number) => {
			const session = await openLegacySession(store, sam, objectiveCode);
			await store.learning_sessions.update(session.id, {
				kind,
				completedAt: new Date(NOW.getTime() - minutes * 60_000).toISOString(),
			});
			if (kind === "review") {
				const [schedule] = await store.revision_schedules.listAll({ studentId: sam, objectiveCode, status: "pending" });
				if (schedule) await store.revision_schedules.update(schedule.id, { status: "done" });
			}
		};
		await finished("review", steps[0] as string, 20);
		await finished("review", steps[1] as string, 10);
		const capped = await getMission(at(0), alice, sam);
		expect(capped).toMatchObject({ reason: "current", objectiveCode: steps[3] });
		await expect(
			startSession(at(0), alice, { studentId: sam, objectiveCode: steps[2] as string, kind: "review" }),
		).rejects.toMatchObject({ code: "off_programme" });
		await finished("lesson", steps[3] as string, 5);
		expect(await getMission(at(0), alice, sam)).toMatchObject({ reason: "review", objectiveCode: steps[2] });
		const started = await startSession(at(0), alice, {
			studentId: sam,
			objectiveCode: steps[2] as string,
			kind: "review",
		});
		expect(started.sessionId).toBeTruthy();
	});

	it("lays out the course by unit with the next step current once a step is secured", async () => {
		const sam = await addLearner("Sam");
		const states = async () =>
			(await getMission(at(DAY), alice, sam)).course.units.flatMap((u) => u.steps.map((s) => [s.code, s.state]));
		const before = await getMission(at(0), alice, sam);
		expect(before.course.units.map((u) => u.id)).toEqual(PROGRAMME_BY_YEAR[3].map((u) => u.id));
		expect(before.course).toMatchObject({ done: 0, total: programmeSteps(3).length });
		expect((await states()).slice(0, 3)).toEqual([
			["EN-Y3-SP-PREFIXES", "current"],
			["EN-Y3-GR-A-AN", "locked"],
			["MA-Y3-PV-DIGIT-VALUE", "locked"],
		]);
		await completeLesson(store, alice, sam, "EN-Y3-SP-PREFIXES");
		const after = await getMission(at(DAY), alice, sam);
		expect(after.course.done).toBe(1);
		expect(after.course.units[0]?.steps[0]).toMatchObject({
			code: "EN-Y3-SP-PREFIXES",
			state: "done",
			status: "secure",
		});
		expect((await states()).slice(0, 3)).toEqual([
			["EN-Y3-SP-PREFIXES", "done"],
			["EN-Y3-GR-A-AN", "current"],
			["MA-Y3-PV-DIGIT-VALUE", "locked"],
		]);
	});

	it("follows a parent override past a blocked step", async () => {
		const sam = await addLearner("Sam");
		await overrideCompetency(at(0), alice, {
			studentId: sam,
			objectiveCode: "EN-Y3-SP-PREFIXES",
			status: "secure",
			reason: "Already known",
		});
		expect(await getMission(at(0), alice, sam)).toMatchObject({ reason: "current", objectiveCode: "EN-Y3-GR-A-AN" });
	});

	it("reports the programme complete with the next review date", async () => {
		const sam = await addLearner("Sam");
		for (const step of programmeSteps(3)) {
			await overrideCompetency(at(0), alice, {
				studentId: sam,
				objectiveCode: step.objectiveCode,
				status: "secure",
				reason: "Already known",
			});
		}
		expect(await getMission(at(0), alice, sam)).toMatchObject({
			reason: "complete",
			nextReviewAt: null,
			objective: null,
			course: { done: programmeSteps(3).length, total: programmeSteps(3).length },
		});
		await store.revision_schedules.create({
			familyId: alice.familyId,
			studentId: sam,
			objectiveCode: "MA-Y3-AS-MENTAL",
			dueAt: new Date(NOW.getTime() + 5 * DAY).toISOString(),
			status: "pending",
		});
		expect(await getMission(at(0), alice, sam)).toMatchObject({
			reason: "complete",
			nextReviewAt: new Date(NOW.getTime() + 5 * DAY).toISOString(),
		});
	});

	it("hides another family's learner", async () => {
		const sam = await addLearner("Sam");
		const bob = await createFamilyForUser(store, "user-bob", "Bob family");
		await expect(getMission(at(0), bob, sam)).rejects.toMatchObject({ code: "not_found" } satisfies Partial<AppError>);
	});
});
