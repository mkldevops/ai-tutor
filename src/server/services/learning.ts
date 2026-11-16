import { randomUUID } from "node:crypto";
import { getObjective, getPrerequisiteCodes, LESSON_OBJECTIVES_BY_YEAR } from "#/curriculum/england-nc-maths";
import type { CompetencyStatus, Confidence, ConfidenceMoment, SessionKind } from "#/domain/types";
import {
	continueToPractice,
	currentItem,
	type Feedback,
	LessonError,
	type LessonState,
	type LessonView,
	requestHint,
	startLesson,
	submitAnswer,
	viewLesson,
} from "#/learning-engine/lesson";
import { DEFAULT_POLICY, evaluateMastery, type MasteryPolicy } from "#/learning-engine/mastery";
import { nextReviewDate } from "#/learning-engine/scheduling";
import type { CompetencyRecord, DataStore, LearningSessionRecord } from "../store/types";
import { AppError, notFound } from "./errors";
import { type Actor, audit, requireStudent } from "./family";

export type SessionResponse = {
	sessionId: string;
	studentId: string;
	objective: { code: string; statement: string; yearGroup: number };
	view: LessonView;
	feedback: Feedback | null;
	hint: string | null;
	result: { status: CompetencyStatus; reasons: string[]; nextReviewAt: string | null } | null;
	confidence: Confidence;
};

type Deps = { store: DataStore; now?: () => Date; policy?: MasteryPolicy };

export function allowedObjectives(yearGroup: 3 | 5): string[] {
	return LESSON_OBJECTIVES_BY_YEAR[yearGroup];
}

async function requireSession(store: DataStore, actor: Actor, sessionId: string) {
	const session = await store.learning_sessions.get(sessionId);
	if (!session || session.familyId !== actor.familyId) throw notFound("Session");
	return session;
}

async function respond(
	store: DataStore,
	session: LearningSessionRecord,
	extra: Partial<Pick<SessionResponse, "feedback" | "hint">> = {},
): Promise<SessionResponse> {
	const objective = getObjective(session.objectiveCode);
	if (!objective) throw notFound("Objective");
	let result: SessionResponse["result"] = null;
	if (session.phase === "complete") {
		const comp = await getCompetency(store, session.studentId, session.objectiveCode);
		const [review] = await store.revision_schedules.list({
			studentId: session.studentId,
			objectiveCode: session.objectiveCode,
			status: "pending",
		});
		result = comp ? { status: comp.status, reasons: comp.reasons, nextReviewAt: review?.dueAt ?? null } : null;
	}
	return {
		sessionId: session.id,
		studentId: session.studentId,
		objective: { code: objective.code, statement: objective.statement, yearGroup: objective.yearGroup },
		view: viewLesson(session.state),
		feedback: extra.feedback ?? null,
		hint: extra.hint ?? null,
		result,
		confidence: session.confidence ?? {},
	};
}

async function getCompetency(store: DataStore, studentId: string, objectiveCode: string) {
	const [comp] = await store.student_competencies.list({ studentId, objectiveCode }, { limit: 1 });
	return comp ?? null;
}

export async function startSession(
	deps: Deps,
	actor: Actor,
	input: { studentId: string; objectiveCode: string; kind: SessionKind },
): Promise<SessionResponse> {
	const { store } = deps;
	const student = await requireStudent(store, actor, input.studentId);
	if (!allowedObjectives(student.yearGroup).includes(input.objectiveCode)) {
		throw new AppError("invalid", "Objective not available for this student's year group");
	}
	const open = (await store.learning_sessions.list({ studentId: student.id, objectiveCode: input.objectiveCode }))
		.filter((s) => s.completedAt === null && s.kind === input.kind)
		.at(-1);
	if (open) return respond(store, open);

	if (input.kind === "review") {
		const pending = await store.revision_schedules.list({
			studentId: student.id,
			objectiveCode: input.objectiveCode,
			status: "pending",
		});
		if (pending.length === 0) throw new AppError("invalid", "No review is scheduled for this objective");
	}

	const state = startLesson({
		kind: input.kind,
		objectiveCode: input.objectiveCode,
		prerequisiteCodes: getPrerequisiteCodes(input.objectiveCode),
		seed: randomUUID(),
	});
	const session = await store.learning_sessions.create({
		familyId: actor.familyId,
		studentId: student.id,
		objectiveCode: input.objectiveCode,
		kind: input.kind,
		phase: state.phase,
		state,
		completedAt: null,
	});
	await audit(store, actor, "session.start", `learning_sessions/${session.id}`, { kind: input.kind });
	return respond(store, session);
}

export async function getSession(deps: Deps, actor: Actor, sessionId: string) {
	return respond(deps.store, await requireSession(deps.store, actor, sessionId));
}

function wrapLesson<T>(fn: () => T): T {
	try {
		return fn();
	} catch (e) {
		if (e instanceof LessonError) throw new AppError("invalid", e.message);
		throw e;
	}
}

async function saveState(store: DataStore, session: LearningSessionRecord, state: LessonState, now: Date) {
	return store.learning_sessions.update(session.id, {
		state,
		phase: state.phase,
		completedAt: state.phase === "complete" ? now.toISOString() : null,
	});
}

export async function continueSession(deps: Deps, actor: Actor, sessionId: string) {
	const session = await requireSession(deps.store, actor, sessionId);
	const state = wrapLesson(() => continueToPractice(session.state));
	return respond(deps.store, await saveState(deps.store, session, state, deps.now?.() ?? new Date()));
}

export async function hintSession(deps: Deps, actor: Actor, sessionId: string) {
	const session = await requireSession(deps.store, actor, sessionId);
	const { state, hint } = wrapLesson(() => requestHint(session.state));
	return respond(deps.store, await saveState(deps.store, session, state, deps.now?.() ?? new Date()), { hint });
}

export async function answerSession(deps: Deps, actor: Actor, sessionId: string, response: string) {
	const { store } = deps;
	const now = deps.now?.() ?? new Date();
	const session = await requireSession(store, actor, sessionId);
	const item = currentItem(session.state);
	const { state, entry, feedback } = wrapLesson(() => submitAnswer(session.state, response));
	if (!item) throw new AppError("invalid", "No question is waiting for an answer.");
	await store.assessment_attempts.create({
		familyId: session.familyId,
		studentId: session.studentId,
		objectiveCode: entry.objectiveCode,
		sessionId: session.id,
		mode: entry.mode,
		itemType: entry.itemType,
		prompt: item.prompt,
		expected: item.answer,
		response,
		correct: entry.correct,
		hintsUsed: entry.hintsUsed,
	});
	const saved = await saveState(store, session, state, now);
	if (state.phase === "complete") {
		if (session.kind === "review") {
			const pending = await store.revision_schedules.list({
				studentId: session.studentId,
				objectiveCode: session.objectiveCode,
				status: "pending",
			});
			for (const p of pending) await store.revision_schedules.update(p.id, { status: "done" });
		}
		await recomputeCompetency(deps, session.familyId, session.studentId, session.objectiveCode, now);
	}
	return respond(store, saved, { feedback });
}

const CONFIDENCE_PHASES: Record<ConfidenceMoment, string[]> = {
	before: ["diagnostic", "review"],
	after: ["complete"],
};

export async function rateConfidence(
	deps: Deps,
	actor: Actor,
	input: { sessionId: string; moment: ConfidenceMoment; value: number },
) {
	const session = await requireSession(deps.store, actor, input.sessionId);
	if (!CONFIDENCE_PHASES[input.moment].includes(session.phase)) {
		throw new AppError("invalid", `Confidence "${input.moment}" cannot be recorded at this point of the mission.`);
	}
	const confidence = { ...session.confidence, [input.moment]: input.value };
	return respond(deps.store, await deps.store.learning_sessions.update(session.id, { confidence }));
}

export async function recomputeCompetency(
	deps: Deps,
	familyId: string,
	studentId: string,
	objectiveCode: string,
	now: Date,
): Promise<CompetencyRecord> {
	const { store } = deps;
	const attempts = await store.assessment_attempts.list({ studentId, objectiveCode }, { limit: 500 });
	const decision = evaluateMastery(
		attempts.map((a) => ({
			sessionId: a.sessionId,
			mode: a.mode,
			itemType: a.itemType,
			correct: a.correct,
			hintsUsed: a.hintsUsed,
			createdAt: a.createdAt,
		})),
		deps.policy ?? DEFAULT_POLICY,
	);
	const existing = await getCompetency(store, studentId, objectiveCode);
	const status = existing?.override?.status ?? decision.status;
	const fields = {
		familyId,
		studentId,
		objectiveCode,
		status,
		computedStatus: decision.status,
		reasons: decision.reasons,
		securedAt: decision.securedAt,
		override: existing?.override ?? null,
	};
	const comp = existing
		? await store.student_competencies.update(existing.id, fields)
		: await store.student_competencies.create(fields);

	const previous = existing?.computedStatus ?? "not_started";
	if (previous !== decision.status) {
		await store.mastery_events.create({
			familyId,
			studentId,
			objectiveCode,
			fromStatus: previous,
			toStatus: decision.status,
			actor: "system",
			actorUserId: null,
			reason: decision.reasons.at(-1) ?? "",
		});
	}

	const pending = await store.revision_schedules.list({ studentId, objectiveCode, status: "pending" });
	const due = nextReviewDate(decision.status, now);
	if (decision.status !== previous || pending.length === 0) {
		for (const p of pending) await store.revision_schedules.update(p.id, { status: "superseded" });
		if (due && ["secure", "mastered", "needs_review"].includes(decision.status)) {
			await store.revision_schedules.create({
				familyId,
				studentId,
				objectiveCode,
				dueAt: due.toISOString(),
				status: "pending",
			});
		}
	}
	return comp;
}

export async function overrideCompetency(
	deps: Deps,
	actor: Actor,
	input: { studentId: string; objectiveCode: string; status: CompetencyStatus | null; reason: string },
) {
	const { store } = deps;
	await requireStudent(store, actor, input.studentId);
	if (!getObjective(input.objectiveCode)) throw notFound("Objective");
	const now = (deps.now?.() ?? new Date()).toISOString();
	const existing = await getCompetency(store, input.studentId, input.objectiveCode);
	const override = input.status
		? { status: input.status, reason: input.reason, byUserId: actor.userId, at: now }
		: null;
	const from = existing?.status ?? "not_started";
	const to = input.status ?? existing?.computedStatus ?? "not_started";
	const fields = { status: to, override };
	const comp = existing
		? await store.student_competencies.update(existing.id, fields)
		: await store.student_competencies.create({
				familyId: actor.familyId,
				studentId: input.studentId,
				objectiveCode: input.objectiveCode,
				computedStatus: "not_started",
				reasons: [],
				securedAt: null,
				...fields,
			});
	await store.mastery_events.create({
		familyId: actor.familyId,
		studentId: input.studentId,
		objectiveCode: input.objectiveCode,
		fromStatus: from,
		toStatus: to,
		actor: "parent",
		actorUserId: actor.userId,
		reason: input.reason,
	});
	await audit(
		store,
		actor,
		input.status ? "competency.override" : "competency.override_clear",
		`students/${input.studentId}`,
		{
			objectiveCode: input.objectiveCode,
			from,
			to,
			reason: input.reason,
		},
	);
	return comp;
}

export async function getStudentProgress(deps: Deps, actor: Actor, studentId: string) {
	const { store } = deps;
	const student = await requireStudent(store, actor, studentId);
	const now = deps.now?.() ?? new Date();
	const objectives = allowedObjectives(student.yearGroup).flatMap((code) => getObjective(code) ?? []);
	const [competencies, schedules, sessions, events, attempts] = await Promise.all([
		store.student_competencies.list({ studentId }),
		store.revision_schedules.list({ studentId, status: "pending" }),
		store.learning_sessions.list({ studentId }),
		store.mastery_events.list({ studentId }),
		store.assessment_attempts.list({ studentId }, { limit: 500 }),
	]);
	return {
		student,
		objectives: objectives.map((o) => {
			const comp = competencies.find((c) => c.objectiveCode === o.code) ?? null;
			const review = schedules.find((s) => s.objectiveCode === o.code) ?? null;
			const objAttempts = attempts.filter((a) => a.objectiveCode === o.code);
			const byMode = (m: string) => {
				const xs = objAttempts.filter((a) => a.mode === m);
				return { items: xs.length, correct: xs.filter((a) => a.correct).length };
			};
			return {
				code: o.code,
				statement: o.statement,
				strand: o.strand,
				source: o.source,
				status: comp?.status ?? "not_started",
				computedStatus: comp?.computedStatus ?? "not_started",
				reasons: comp?.reasons ?? [],
				override: comp?.override ?? null,
				review: review ? { dueAt: review.dueAt, isDue: Date.parse(review.dueAt) <= now.getTime() } : null,
				evidence: {
					diagnostic: byMode("diagnostic"),
					guided: byMode("guided"),
					independent: byMode("independent"),
					review: byMode("review"),
				},
				openSessionId: sessions.filter((s) => s.objectiveCode === o.code && s.completedAt === null).at(-1)?.id ?? null,
			};
		}),
		recentSessions: sessions
			.slice(-10)
			.reverse()
			.map((s) => ({
				id: s.id,
				objectiveCode: s.objectiveCode,
				kind: s.kind,
				phase: s.phase,
				completedAt: s.completedAt,
				confidence: s.confidence ?? {},
				createdAt: s.createdAt,
			})),
		events: events.slice(-20).reverse(),
	};
}
