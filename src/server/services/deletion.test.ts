import { beforeEach, describe, expect, it } from "vitest";
import { currentItem } from "#/learning-engine/lesson";
import { createMemoryAuth } from "../auth/provider";
import { createMemoryStore } from "../store/memory-store";
import type { DataStore, TableName } from "../store/types";
import { deleteAccount, deleteFamily, deleteStudent } from "./deletion";
import { type Actor, createFamilyForUser, createStudent, resolveActor, STUDENT_OWNED } from "./family";
import { answerSession, continueSession, overrideCompetency, startSession } from "./learning";
import { placeAt } from "./programme-fixtures";
import { programmeSettingsOf } from "./programme-settings";

const prefs = { readingSupport: false, theme: "calm" as const };
const OBJECTIVE = "MA-Y3-AS-MENTAL";

async function completeLesson(store: DataStore, actor: Actor, studentId: string) {
	await placeAt(store, studentId, OBJECTIVE);
	let res = await startSession({ store }, actor, { studentId, objectiveCode: OBJECTIVE, kind: "lesson" });
	while (res.view.phase !== "complete") {
		if (res.view.phase === "instruction") {
			res = await continueSession({ store }, actor, res.sessionId);
			continue;
		}
		const session = await store.learning_sessions.get(res.sessionId);
		res = await answerSession({ store }, actor, res.sessionId, currentItem(session!.state)!.answer);
	}
	return res.sessionId;
}

async function seedLearner(store: DataStore, actor: Actor, displayName: string) {
	const student = await createStudent(store, actor, { displayName, yearGroup: 3, preferences: prefs });
	const sessionId = await completeLesson(store, actor, student.id);
	await overrideCompetency({ store }, actor, {
		studentId: student.id,
		objectiveCode: OBJECTIVE,
		status: "developing",
		reason: "Homework was hard",
	});
	const base = { familyId: actor.familyId, studentId: student.id };
	await store.session_messages.create({
		...base,
		sessionId,
		role: "child",
		text: `${displayName} says hello`,
		expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
	});
	await store.worksheet_checks.create({
		...base,
		objectiveCode: OBJECTIVE,
		imageSha256: "a".repeat(64),
		mimeType: "image/png",
		bytes: 10,
		model: "fake",
		imageQuality: "good",
		items: [],
		handwriting: { note: "", confidence: "high" },
		flags: [],
		status: "pending_review",
		reviewedByUserId: null,
		reviewedAt: null,
		parentNote: null,
	});
	await store.revision_schedules.create({
		...base,
		objectiveCode: OBJECTIVE,
		dueAt: new Date().toISOString(),
		status: "done",
	});
	await store.students.update(student.id, {
		programme: {
			paused: true,
			skips: [{ objectiveCode: OBJECTIVE, reason: "Known", byUserId: actor.userId, at: new Date().toISOString() }],
			paceTarget: 4,
		},
	});
	return student.id;
}

type AnyTable = DataStore["assessment_attempts"];
const FAMILY_TABLES: TableName[] = [...STUDENT_OWNED, "students"];

async function familyRowCounts(store: DataStore, familyId: string) {
	const out: Record<string, number> = {};
	for (const t of FAMILY_TABLES) out[t] = (await (store[t] as AnyTable).listAll({ familyId })).length;
	out.family_members = (await store.family_members.listAll({ familyId })).length;
	out.families = (await store.families.get(familyId)) ? 1 : 0;
	return out;
}

async function studentRowCount(store: DataStore, studentId: string) {
	let n = (await store.students.get(studentId)) ? 1 : 0;
	for (const t of STUDENT_OWNED) n += (await (store[t] as AnyTable).listAll({ studentId })).length;
	return n;
}

describe("learner deletion", () => {
	let store: DataStore;
	let alice: Actor;
	let bob: Actor;
	let sam: string;
	let ada: string;
	let kai: string;

	beforeEach(async () => {
		store = createMemoryStore();
		alice = await createFamilyForUser(store, "user-alice", "Alice family");
		bob = await createFamilyForUser(store, "user-bob", "Bob family");
		sam = await seedLearner(store, alice, "Sam");
		ada = await seedLearner(store, alice, "Ada");
		kai = await seedLearner(store, bob, "Kai");
	});

	it("seeds a row in every learner table", async () => {
		const counts = await familyRowCounts(store, alice.familyId);
		for (const t of FAMILY_TABLES) expect(counts[t], t).toBeGreaterThan(0);
	});

	it("removes every row of the learner and leaves siblings and other families untouched", async () => {
		const bobBefore = await familyRowCounts(store, bob.familyId);
		const adaBefore = await studentRowCount(store, ada);
		const counts = await deleteStudent(store, alice, sam, " Sam ");
		expect(await studentRowCount(store, sam)).toBe(0);
		expect(counts.students).toBe(1);
		expect(counts.session_messages).toBe(1);
		expect(await studentRowCount(store, ada)).toBe(adaBefore);
		expect(programmeSettingsOf((await store.students.get(ada))!).paused).toBe(true);
		expect(await familyRowCounts(store, bob.familyId)).toEqual(bobBefore);
	});

	it("refuses another family's learner without deleting anything", async () => {
		const before = await studentRowCount(store, kai);
		await expect(deleteStudent(store, alice, kai, "Kai")).rejects.toMatchObject({ code: "not_found" });
		expect(await studentRowCount(store, kai)).toBe(before);
	});

	it("requires the typed name to match", async () => {
		const before = await studentRowCount(store, sam);
		await expect(deleteStudent(store, alice, sam, "sam")).rejects.toMatchObject({ code: "invalid" });
		expect(await studentRowCount(store, sam)).toBe(before);
	});

	it("audits counts only, never the learner's name or content", async () => {
		await deleteStudent(store, alice, sam, "Sam");
		const logs = await store.audit_logs.listAll({ familyId: alice.familyId });
		const entries = logs.filter((l) => l.action.startsWith("student.delete"));
		expect(entries.map((l) => l.action)).toEqual(["student.delete_requested", "student.delete"]);
		const text = JSON.stringify(entries);
		expect(text).not.toContain("Sam");
		expect(text).not.toContain("hello");
	});

	it("resumes after a failure midway", async () => {
		const attempts = store.assessment_attempts;
		const realDelete = attempts.delete.bind(attempts);
		let calls = 0;
		attempts.delete = async (id) => {
			calls += 1;
			if (calls === 2) throw new Error("network down");
			return realDelete(id);
		};
		await expect(deleteStudent(store, alice, sam, "Sam")).rejects.toThrow("network down");
		expect(await store.students.get(sam)).not.toBeNull();
		await deleteStudent(store, alice, sam, "Sam");
		expect(await studentRowCount(store, sam)).toBe(0);
	});
});

describe("family deletion", () => {
	let store: DataStore;
	let alice: Actor;
	let bob: Actor;

	beforeEach(async () => {
		store = createMemoryStore();
		alice = await createFamilyForUser(store, "user-alice", "Alice family");
		bob = await createFamilyForUser(store, "user-bob", "Bob family");
		await seedLearner(store, alice, "Sam");
		await seedLearner(store, alice, "Ada");
		await seedLearner(store, bob, "Kai");
	});

	it("removes every family row, including orphans, and leaves other families untouched", async () => {
		await store.session_messages.create({
			familyId: alice.familyId,
			studentId: "already-gone",
			sessionId: "s",
			role: "tutor",
			text: "orphan",
			expiresAt: new Date().toISOString(),
		});
		const bobBefore = await familyRowCounts(store, bob.familyId);
		const counts = await deleteFamily(store, alice);
		const after = await familyRowCounts(store, alice.familyId);
		for (const [table, n] of Object.entries(after)) expect(n, table).toBe(0);
		expect(counts.students).toBe(2);
		expect(await familyRowCounts(store, bob.familyId)).toEqual(bobBefore);
	});

	it("is limited to the owner", async () => {
		await store.family_members.create({ familyId: alice.familyId, userId: "user-carol", role: "parent" });
		const carol: Actor = { userId: "user-carol", familyId: alice.familyId, role: "parent" };
		await expect(deleteFamily(store, carol)).rejects.toMatchObject({ code: "forbidden" });
		const spoofed: Actor = { userId: "user-bob", familyId: alice.familyId, role: "owner" };
		await expect(deleteFamily(store, spoofed)).rejects.toMatchObject({ code: "forbidden" });
		expect((await familyRowCounts(store, alice.familyId)).students).toBe(2);
	});

	it("resumes after a failure midway", async () => {
		const members = store.family_members;
		const realDelete = members.delete.bind(members);
		let calls = 0;
		members.delete = async (id) => {
			calls += 1;
			if (calls === 2) throw new Error("network down");
			return realDelete(id);
		};
		await store.family_members.create({ familyId: alice.familyId, userId: "user-carol", role: "parent" });
		await expect(deleteFamily(store, alice)).rejects.toThrow("network down");
		expect(await store.families.get(alice.familyId)).toBeNull();
		expect((await resolveActor(store, alice.userId))?.role).toBe("owner");
		await deleteFamily(store, alice);
		const after = await familyRowCounts(store, alice.familyId);
		for (const [table, n] of Object.entries(after)) expect(n, table).toBe(0);
	});
});

describe("account deletion", () => {
	let store: DataStore;
	const auth = createMemoryAuth();

	beforeEach(() => {
		store = createMemoryStore();
	});

	it("deletes the family data and the parent user", async () => {
		const res = await auth.signUp("parent@example.test", "correct-horse-battery", "Parent");
		const actor = await createFamilyForUser(store, res.user.id, "Family");
		await seedLearner(store, actor, "Sam");
		const other = await createFamilyForUser(store, "user-bob", "Bob family");
		await seedLearner(store, other, "Kai");
		const bobBefore = await familyRowCounts(store, other.familyId);

		await expect(deleteAccount({ store, auth }, res.user, "someone@example.test")).rejects.toMatchObject({
			code: "invalid",
		});
		expect((await familyRowCounts(store, actor.familyId)).students).toBe(1);

		await deleteAccount({ store, auth }, res.user, " Parent@Example.test ");
		for (const [table, n] of Object.entries(await familyRowCounts(store, actor.familyId))) expect(n, table).toBe(0);
		expect(await familyRowCounts(store, other.familyId)).toEqual(bobBefore);
		expect(await auth.getUser(res.sessionSecret)).toBeNull();
		await expect(auth.signIn("parent@example.test", "correct-horse-battery")).rejects.toMatchObject({
			code: "invalid_credentials",
		});
		const log = await store.audit_logs.listAll({ action: "account.delete" });
		expect(log).toHaveLength(1);
		expect(JSON.stringify(await store.audit_logs.listAll({}))).not.toContain("parent@example.test");
	});

	it("finishes an account whose family was already removed", async () => {
		const res = await auth.signUp("orphan@example.test", "correct-horse-battery", "Parent");
		await deleteAccount({ store, auth }, res.user, "orphan@example.test");
		expect(await auth.getUser(res.sessionSecret)).toBeNull();
	});
});
