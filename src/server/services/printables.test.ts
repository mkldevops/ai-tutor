import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryStore } from "../store/memory-store";
import type { DataStore } from "../store/types";
import { AppError } from "./errors";
import { type Actor, createFamilyForUser, createStudent } from "./family";
import { printableObjectives } from "./learning";
import { getPrintableSheet } from "./printables";

const prefs = { readingSupport: false, theme: "calm" as const };

describe("printable sheets", () => {
	let store: DataStore;
	let alice: Actor;
	let bob: Actor;
	let sam: string;

	beforeEach(async () => {
		store = createMemoryStore();
		alice = await createFamilyForUser(store, "user-alice", "Alice family");
		bob = await createFamilyForUser(store, "user-bob", "Bob family");
		sam = (await createStudent(store, alice, { displayName: "Sam", yearGroup: 3, preferences: prefs })).id;
	});

	const sheet = (over: Partial<Parameters<typeof getPrintableSheet>[2]> = {}, actor = alice) =>
		getPrintableSheet(store, actor, {
			studentId: sam,
			objectiveCode: "MA-Y3-AS-MENTAL",
			seed: "seed-0001",
			count: 10,
			difficulty: null,
			variant: "worksheet",
			...over,
		});

	it("offers year objectives plus prerequisites", () => {
		expect(printableObjectives(3)).toEqual([
			"MA-Y3-AS-MENTAL",
			"MA-Y2-AS-MENTAL",
			"MA-Y3-PV-MORE-LESS",
			"MA-Y3-MD-TABLES-348",
		]);
		expect(printableObjectives(5)).toEqual([
			"MA-Y5-MD-POWERS10",
			"MA-Y4-FR-DIV10-100",
			"MA-Y5-PV-ROUND",
			"MA-Y5-MD-FACTORS",
		]);
	});

	it("never sends answers with the worksheet, only with the key", async () => {
		const w = await sheet();
		expect(w.items.every((i) => i.answer === "" && i.workedSolution === "")).toBe(true);
		const k = await sheet({ variant: "answer_key" });
		expect(k.items.every((i) => i.answer !== "")).toBe(true);
		expect(k.items.map((i) => i.prompt)).toEqual(w.items.map((i) => i.prompt));
	});

	it("picks the level from progress when auto", async () => {
		expect((await sheet()).difficulty).toBe(1);
		await store.student_competencies.create({
			familyId: alice.familyId,
			studentId: sam,
			objectiveCode: "MA-Y3-AS-MENTAL",
			status: "secure",
			computedStatus: "secure",
			reasons: [],
			securedAt: null,
			override: null,
		});
		expect((await sheet()).difficulty).toBe(3);
		expect((await sheet({ difficulty: 2 })).difficulty).toBe(2);
	});

	it("audits each print", async () => {
		await sheet();
		await sheet({ variant: "answer_key" });
		const actions = (await store.audit_logs.list({})).map((a) => a.action);
		expect(actions).toContain("worksheet.print_worksheet");
		expect(actions).toContain("worksheet.print_answer_key");
	});

	it("rejects other families and unknown objectives", async () => {
		await expect(sheet({}, bob)).rejects.toThrow();
		await expect(sheet({ objectiveCode: "MA-Y5-MD-POWERS10" })).rejects.toBeInstanceOf(AppError);
	});

	it("keeps English objectives off paper sheets", async () => {
		await expect(sheet({ objectiveCode: "EN-Y3-SP-PREFIXES" })).rejects.toBeInstanceOf(AppError);
	});
});
