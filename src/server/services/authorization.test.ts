import { beforeEach, describe, expect, it } from "vitest";
import { currentItem } from "#/learning-engine/lesson";
import { createMemoryStore } from "../store/memory-store";
import type { DataStore } from "../store/types";
import { AppError } from "./errors";
import {
	type Actor,
	createFamilyForUser,
	createStudent,
	deleteStudent,
	exportStudentData,
	listStudents,
	resolveActor,
	updateStudent,
} from "./family";
import {
	answerSession,
	continueSession,
	getSession,
	getStudentProgress,
	hintSession,
	overrideCompetency,
	startSession,
} from "./learning";

const prefs = { readingSupport: false, theme: "calm" as const };

async function completeLesson(store: DataStore, actor: Actor, studentId: string, objectiveCode: string) {
	let res = await startSession({ store }, actor, { studentId, objectiveCode, kind: "lesson" });
	while (res.view.phase !== "complete") {
		if (res.view.phase === "instruction") {
			res = await continueSession({ store }, actor, res.sessionId);
			continue;
		}
		const session = await store.learning_sessions.get(res.sessionId);
		const item = currentItem(session!.state);
		res = await answerSession({ store }, actor, res.sessionId, item!.answer);
	}
	return res;
}

const expectNotFound = async (p: Promise<unknown>) => {
	await expect(p).rejects.toBeInstanceOf(AppError);
	await expect(p).rejects.toMatchObject({ code: "not_found" });
};

describe("tenant isolation", () => {
	let store: DataStore;
	let alice: Actor;
	let bob: Actor;
	let aliceY3: string;
	let bobY5: string;

	beforeEach(async () => {
		store = createMemoryStore();
		alice = await createFamilyForUser(store, "user-alice", "Alice family");
		bob = await createFamilyForUser(store, "user-bob", "Bob family");
		aliceY3 = (await createStudent(store, alice, { displayName: "Sam", yearGroup: 3, preferences: prefs })).id;
		bobY5 = (await createStudent(store, bob, { displayName: "Kai", yearGroup: 5, preferences: prefs })).id;
	});

	it("resolves each user to their own family", async () => {
		expect((await resolveActor(store, "user-alice"))?.familyId).toBe(alice.familyId);
		expect(await resolveActor(store, "user-unknown")).toBeNull();
	});

	it("lists only own students", async () => {
		expect((await listStudents(store, alice)).map((s) => s.id)).toEqual([aliceY3]);
		expect((await listStudents(store, bob)).map((s) => s.id)).toEqual([bobY5]);
	});

	it("forbids reading, updating, exporting or deleting another family's student", async () => {
		await expectNotFound(getStudentProgress({ store }, alice, bobY5));
		await expectNotFound(updateStudent(store, alice, bobY5, { displayName: "X" }));
		await expectNotFound(exportStudentData(store, alice, bobY5));
		await expectNotFound(deleteStudent(store, alice, bobY5));
		expect(await store.students.get(bobY5)).not.toBeNull();
	});

	it("forbids starting a session for another family's student", async () => {
		await expectNotFound(
			startSession({ store }, alice, { studentId: bobY5, objectiveCode: "MA-Y5-MD-POWERS10", kind: "lesson" }),
		);
	});

	it("forbids reading or answering another family's session", async () => {
		const s = await startSession({ store }, bob, {
			studentId: bobY5,
			objectiveCode: "MA-Y5-MD-POWERS10",
			kind: "lesson",
		});
		await expectNotFound(getSession({ store }, alice, s.sessionId));
		await expectNotFound(answerSession({ store }, alice, s.sessionId, "1"));
		await expectNotFound(hintSession({ store }, alice, s.sessionId));
		await expectNotFound(continueSession({ store }, alice, s.sessionId));
		expect(await store.assessment_attempts.list({ sessionId: s.sessionId })).toHaveLength(0);
	});

	it("forbids overriding another family's competency", async () => {
		await expectNotFound(
			overrideCompetency({ store }, alice, {
				studentId: bobY5,
				objectiveCode: "MA-Y5-MD-POWERS10",
				status: "mastered",
				reason: "x",
			}),
		);
	});

	it("rejects objectives outside the student's year group", async () => {
		await expect(
			startSession({ store }, alice, { studentId: aliceY3, objectiveCode: "MA-Y5-MD-POWERS10", kind: "lesson" }),
		).rejects.toMatchObject({ code: "invalid" });
	});

	it("keeps histories and skill statuses distinct per student", async () => {
		const a = await completeLesson(store, alice, aliceY3, "MA-Y3-AS-MENTAL");
		const b = await completeLesson(store, bob, bobY5, "MA-Y5-MD-POWERS10");
		expect(a.result?.status).toBe("secure");
		expect(b.result?.status).toBe("secure");

		const pa = await getStudentProgress({ store }, alice, aliceY3);
		const pb = await getStudentProgress({ store }, bob, bobY5);
		expect(pa.objectives.map((o) => o.code)).toEqual(["MA-Y3-AS-MENTAL"]);
		expect(pb.objectives.map((o) => o.code)).toEqual(["MA-Y5-MD-POWERS10"]);
		expect(pa.objectives[0]?.review).not.toBeNull();

		const aAttempts = await store.assessment_attempts.list({ studentId: aliceY3 });
		expect(aAttempts.every((x) => x.familyId === alice.familyId)).toBe(true);
		const bAttempts = await store.assessment_attempts.list({ studentId: bobY5 });
		expect(bAttempts.every((x) => x.familyId === bob.familyId)).toBe(true);
	});

	it("does not grant mastery from a perfect lesson without delayed review", async () => {
		const res = await completeLesson(store, alice, aliceY3, "MA-Y3-AS-MENTAL");
		expect(res.result?.status).not.toBe("mastered");
	});

	it("records parent override with reason and audit trail", async () => {
		await overrideCompetency({ store }, alice, {
			studentId: aliceY3,
			objectiveCode: "MA-Y3-AS-MENTAL",
			status: "developing",
			reason: "Struggled with homework",
		});
		const p = await getStudentProgress({ store }, alice, aliceY3);
		expect(p.objectives[0]?.status).toBe("developing");
		expect(p.objectives[0]?.override?.reason).toBe("Struggled with homework");
		const logs = await store.audit_logs.list({ familyId: alice.familyId, action: "competency.override" });
		expect(logs).toHaveLength(1);
	});

	it("deletes all of a student's data", async () => {
		await completeLesson(store, alice, aliceY3, "MA-Y3-AS-MENTAL");
		await deleteStudent(store, alice, aliceY3);
		expect(await store.students.get(aliceY3)).toBeNull();
		expect(await store.assessment_attempts.list({ studentId: aliceY3 })).toHaveLength(0);
		expect(await store.learning_sessions.list({ studentId: aliceY3 })).toHaveLength(0);
	});
});
