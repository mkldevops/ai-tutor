import { beforeEach, describe, expect, it } from "vitest";
import { getPrerequisiteCodes } from "#/curriculum/england-nc";
import { programmeSteps } from "#/curriculum/programme";
import { currentItem } from "#/learning-engine/lesson";
import { LESSON_EXPIRY_DAYS } from "../config";
import { createMemoryStore } from "../store/memory-store";
import type { DataStore } from "../store/types";
import { type Actor, createFamilyForUser, createStudent } from "./family";
import { answerSession, continueSession, overrideCompetency, startSession } from "./learning";
import { openLegacySession, placeAt } from "./programme-fixtures";

const DAY = 86_400_000;
const NOW = new Date();
const prefs = { readingSupport: false, theme: "calm" as const };

describe("startSession programme guard", () => {
	let store: DataStore;
	let alice: Actor;
	const at = (days: number) => ({ store, now: () => new Date(NOW.getTime() + days * DAY) });
	const addLearner = async (yearGroup: 3 | 5 = 3) =>
		(await createStudent(store, alice, { displayName: "Sam", yearGroup, preferences: prefs })).id;
	const start = (days: number, studentId: string, objectiveCode: string, kind: "lesson" | "review" = "lesson") =>
		startSession(at(days), alice, { studentId, objectiveCode, kind });
	const offProgrammeAudits = async () =>
		(await store.audit_logs.listAll({ familyId: alice.familyId })).filter((a) => a.action === "session.off_programme");

	async function completeLesson(days: number, studentId: string, objectiveCode: string) {
		let res = await start(days, studentId, objectiveCode);
		while (res.view.phase !== "complete") {
			if (res.view.phase === "instruction") {
				res = await continueSession(at(days), alice, res.sessionId);
				continue;
			}
			const session = await store.learning_sessions.get(res.sessionId);
			const item = currentItem(session?.state as NonNullable<typeof session>["state"]);
			res = await answerSession(at(days), alice, res.sessionId, item?.answer ?? "");
		}
		return res;
	}

	beforeEach(async () => {
		store = createMemoryStore();
		alice = await createFamilyForUser(store, "user-alice", "Alice family");
	});

	it("rejects a locked objective and audits the attempt", async () => {
		const sam = await addLearner();
		await expect(start(0, sam, "MA-Y3-AS-MENTAL")).rejects.toMatchObject({ code: "off_programme" });
		expect(await store.learning_sessions.listAll({ studentId: sam })).toHaveLength(0);
		const [entry] = await offProgrammeAudits();
		expect(entry).toMatchObject({
			target: `students/${sam}`,
			detail: {
				objectiveCode: "MA-Y3-AS-MENTAL",
				kind: "lesson",
				mission: { objectiveCode: "EN-Y3-SP-PREFIXES", kind: "lesson" },
			},
		});
	});

	it("accepts the current step", async () => {
		const sam = await addLearner();
		const res = await start(0, sam, "EN-Y3-SP-PREFIXES");
		expect(res.objective.code).toBe("EN-Y3-SP-PREFIXES");
		expect(await offProgrammeAudits()).toHaveLength(0);
	});

	it("accepts a review only once it is due, and then ahead of the current step", async () => {
		const sam = await addLearner();
		const done = await completeLesson(0, sam, "EN-Y3-SP-PREFIXES");
		const dueAt = done.result?.nextReviewAt;
		expect(dueAt).toBeTruthy();
		const daysToDue = Math.ceil((Date.parse(dueAt as string) - NOW.getTime()) / DAY);

		await expect(start(1, sam, "EN-Y3-SP-PREFIXES", "review")).rejects.toMatchObject({ code: "off_programme" });
		await expect(start(daysToDue, sam, "EN-Y3-GR-A-AN")).rejects.toMatchObject({ code: "off_programme" });
		const review = await start(daysToDue, sam, "EN-Y3-SP-PREFIXES", "review");
		expect(review.objective.code).toBe("EN-Y3-SP-PREFIXES");
	});

	it("does not block a Y5 learner on Y3/Y4 prerequisites", async () => {
		const kai = await addLearner(5);
		const [first] = programmeSteps(5);
		expect(getPrerequisiteCodes("MA-Y5-MD-POWERS10").some((c) => !c.startsWith("MA-Y5"))).toBe(true);
		await expect(start(0, kai, first?.objectiveCode as string)).resolves.toBeDefined();

		const other = await addLearner(5);
		await placeAt(store, other, "MA-Y5-MD-POWERS10");
		const res = await start(0, other, "MA-Y5-MD-POWERS10");
		expect(res.objective.code).toBe("MA-Y5-MD-POWERS10");
	});

	it("moves past a blocked step through the parent override", async () => {
		const sam = await addLearner();
		await overrideCompetency(at(0), alice, {
			studentId: sam,
			objectiveCode: "EN-Y3-SP-PREFIXES",
			status: "secure",
			reason: "Already known",
		});
		await expect(start(0, sam, "EN-Y3-GR-A-AN")).resolves.toBeDefined();
	});

	it("resumes an off-path session opened before the guard until it expires, then refuses it", async () => {
		const sam = await addLearner();
		const legacy = await openLegacySession(store, sam, "MA-Y3-AS-MENTAL");
		const resumed = await start(LESSON_EXPIRY_DAYS - 1, sam, "MA-Y3-AS-MENTAL");
		expect(resumed.sessionId).toBe(legacy.id);
		await expect(start(1, sam, "EN-Y3-SP-PREFIXES")).rejects.toMatchObject({ code: "off_programme" });

		await expect(start(LESSON_EXPIRY_DAYS + 1, sam, "MA-Y3-AS-MENTAL")).rejects.toMatchObject({
			code: "off_programme",
		});
		await expect(start(LESSON_EXPIRY_DAYS + 1, sam, "EN-Y3-SP-PREFIXES")).resolves.toBeDefined();
	});

	it("refuses new lessons once the programme is complete", async () => {
		const sam = await addLearner();
		const steps = programmeSteps(3);
		const last = steps.at(-1)?.objectiveCode as string;
		await placeAt(store, sam, last);
		await overrideCompetency(at(0), alice, { studentId: sam, objectiveCode: last, status: "secure", reason: "Known" });
		await expect(start(0, sam, steps[0]?.objectiveCode as string)).rejects.toMatchObject({ code: "off_programme" });
	});
});
