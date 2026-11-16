import { readWorksheet, type VisionGenerate } from "#/ai/worksheet-reader";
import { detectInjection } from "#/knowledge/pipeline";
import { gradeItem } from "#/worksheets/grade";
import { ImageRejected, validateImage } from "#/worksheets/image";
import type { DataStore, WorksheetCheckRecord, WorksheetItem } from "../store/types";
import { AppError, notFound } from "./errors";
import { type Actor, audit, requireStudent } from "./family";
import { allowedObjectives, recomputeCompetency } from "./learning";

export type WorksheetReader = { model: string; generate: VisionGenerate };

const hidden = (c: number) =>
	(c < 32 && c !== 10) ||
	c === 127 ||
	(c >= 0x200b && c <= 0x200f) ||
	(c >= 0x202a && c <= 0x202e) ||
	(c >= 0x2066 && c <= 0x2069);
const sanitize = (s: string) =>
	[...s]
		.filter((ch) => !hidden(ch.codePointAt(0) ?? 0))
		.join("")
		.trim();

function grade(question: string, childAnswer: string, legibility: WorksheetItem["legibility"]) {
	if (legibility === "illegible") return { verdict: "unchecked" as const, expected: null };
	return gradeItem(question, childAnswer);
}

export function summarize(items: WorksheetItem[]) {
	const count = (v: WorksheetItem["verdict"]) => items.filter((i) => i.verdict === v).length;
	return {
		items: items.length,
		correct: count("correct"),
		incorrect: count("incorrect"),
		unchecked: count("unchecked"),
	};
}

export async function checkWorksheetPhoto(
	deps: { store: DataStore; reader: WorksheetReader },
	actor: Actor,
	input: { studentId: string; objectiveCode: string; imageBase64: string; mimeType: string },
): Promise<WorksheetCheckRecord> {
	const { store, reader } = deps;
	const student = await requireStudent(store, actor, input.studentId);
	if (!allowedObjectives(student.yearGroup).includes(input.objectiveCode)) {
		throw new AppError("invalid", "Objective not available for this learner");
	}
	let image: ReturnType<typeof validateImage>;
	try {
		image = validateImage(input.imageBase64, input.mimeType);
	} catch (e) {
		if (e instanceof ImageRejected) throw new AppError("invalid", e.message);
		throw e;
	}
	const target = `students/${student.id}`;
	let reading: Awaited<ReturnType<typeof readWorksheet>>;
	try {
		reading = await readWorksheet(reader.generate, image);
	} catch (e) {
		await audit(store, actor, "worksheet.check_failed", target, {
			model: reader.model,
			imageSha256: image.sha256,
			reason: e instanceof Error ? e.message.slice(0, 200) : "unknown",
		});
		throw new AppError("invalid", "The photo could not be read. Try a clearer, well-lit photo of one page.");
	}

	const items: WorksheetItem[] = reading.items.map((i) => {
		const question = sanitize(i.question);
		const childAnswer = sanitize(i.childAnswer);
		return {
			question,
			childAnswer,
			legibility: i.legibility,
			...grade(question, childAnswer, i.legibility),
			editedByParent: false,
		};
	});
	const note = sanitize(reading.handwriting.note);
	const flags = [...new Set(detectInjection([note, ...items.flatMap((i) => [i.question, i.childAnswer])].join("\n")))];
	const check = await store.worksheet_checks.create({
		familyId: actor.familyId,
		studentId: student.id,
		objectiveCode: input.objectiveCode,
		imageSha256: image.sha256,
		mimeType: image.mimeType,
		bytes: image.bytes.length,
		model: reader.model,
		imageQuality: reading.imageQuality,
		items,
		handwriting: { note: flags.length > 0 ? "" : note, confidence: reading.handwriting.confidence },
		flags,
		status: "pending_review",
		reviewedByUserId: null,
		reviewedAt: null,
		parentNote: null,
	});
	await audit(store, actor, "worksheet.check", target, {
		checkId: check.id,
		objectiveCode: input.objectiveCode,
		model: reader.model,
		imageSha256: image.sha256,
		bytes: image.bytes.length,
		imageQuality: reading.imageQuality,
		flags,
		...summarize(items),
	});
	return check;
}

export async function listWorksheetChecks(store: DataStore, actor: Actor, studentId: string) {
	await requireStudent(store, actor, studentId);
	const rows = await store.worksheet_checks.list({ studentId, familyId: actor.familyId }, { limit: 500 });
	return rows.slice(-10).reverse();
}

async function replaceEvidence(store: DataStore, check: WorksheetCheckRecord, items: WorksheetItem[]) {
	const previous = await store.assessment_attempts.list({ sessionId: check.id }, { limit: 100 });
	for (const a of previous) await store.assessment_attempts.delete(a.id);
	const checked = items.filter((i) => i.verdict !== "unchecked");
	for (const item of checked) {
		await store.assessment_attempts.create({
			familyId: check.familyId,
			studentId: check.studentId,
			objectiveCode: check.objectiveCode,
			sessionId: check.id,
			mode: "guided",
			itemType: "numeric",
			prompt: item.question.slice(0, 500),
			expected: (item.expected ?? item.childAnswer).slice(0, 64),
			response: item.childAnswer.slice(0, 64),
			correct: item.verdict === "correct",
			hintsUsed: 0,
		});
	}
	if (previous.length > 0 || checked.length > 0) {
		await recomputeCompetency({ store }, check.familyId, check.studentId, check.objectiveCode, new Date());
	}
	return checked.length;
}

async function requireCheck(store: DataStore, actor: Actor, checkId: string) {
	const check = await store.worksheet_checks.get(checkId);
	if (!check || check.familyId !== actor.familyId) throw notFound("Worksheet check");
	await requireStudent(store, actor, check.studentId);
	return check;
}

export async function reviewWorksheetCheck(
	store: DataStore,
	actor: Actor,
	checkId: string,
	input: { corrections: { index: number; childAnswer: string }[]; parentNote: string | null },
) {
	const check = await requireCheck(store, actor, checkId);
	const items = [...check.items];
	for (const c of input.corrections) {
		const item = items[c.index];
		if (!item) throw new AppError("invalid", "Unknown worksheet item");
		const childAnswer = sanitize(c.childAnswer);
		if (childAnswer === item.childAnswer) continue;
		items[c.index] = {
			...item,
			childAnswer,
			legibility: "clear",
			...gradeItem(item.question, childAnswer),
			editedByParent: true,
		};
	}
	const updated = await store.worksheet_checks.update(check.id, {
		items,
		status: "reviewed",
		reviewedByUserId: actor.userId,
		reviewedAt: new Date().toISOString(),
		parentNote: input.parentNote ? sanitize(input.parentNote) : null,
	});
	const attempts = await replaceEvidence(store, updated, items);
	await audit(store, actor, "worksheet.review", `students/${check.studentId}`, {
		checkId: check.id,
		corrected: items.filter((i) => i.editedByParent).length,
		attempts,
		...summarize(items),
	});
	return updated;
}

export async function deleteWorksheetCheck(store: DataStore, actor: Actor, checkId: string) {
	const check = await requireCheck(store, actor, checkId);
	await store.worksheet_checks.delete(check.id);
	await replaceEvidence(store, check, []);
	await audit(store, actor, "worksheet.delete", `students/${check.studentId}`, { checkId: check.id });
}
