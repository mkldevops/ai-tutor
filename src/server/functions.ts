import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
	answerInputSchema,
	competencyStatusSchema,
	displayNameSchema,
	sessionKindSchema,
	studentPreferencesSchema,
	yearGroupSchema,
} from "#/domain/types";

const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,36}$/);

async function guard<T>(fn: () => Promise<T>): Promise<T> {
	const { AppError } = await import("./services/errors");
	try {
		return await fn();
	} catch (e) {
		if (e instanceof AppError) throw new Error(e.message);
		const { AuthError } = await import("./auth/provider");
		if (e instanceof AuthError) throw new Error(e.message);
		console.error("[ai-tutor] unexpected error", e);
		throw new Error("Something went wrong. Please try again.");
	}
}

export const getMe = createServerFn({ method: "GET" }).handler(async () => {
	const { currentUser } = await import("./session");
	const { getServerContext } = await import("./context");
	const { resolveActor } = await import("./services/family");
	const user = await currentUser();
	if (!user) return null;
	const actor = await resolveActor(getServerContext().store, user.id);
	return { user: { id: user.id, email: user.email, name: user.name }, familyId: actor?.familyId ?? null };
});

const credentialsSchema = z.object({
	email: z.email().max(254),
	password: z.string().min(10, "At least 10 characters").max(128),
});

export const signUp = createServerFn({ method: "POST" })
	.validator(
		credentialsSchema.extend({ name: z.string().trim().min(1).max(60), familyName: z.string().trim().min(1).max(60) }),
	)
	.handler(({ data }) =>
		guard(async () => {
			const { getServerContext } = await import("./context");
			const { setSessionCookie, clientKey } = await import("./session");
			const { rateLimit } = await import("./rate-limit");
			const { createFamilyForUser } = await import("./services/family");
			rateLimit(`signup:${clientKey()}`, 5, 60 * 60_000);
			const { auth, store } = getServerContext();
			const res = await auth.signUp(data.email, data.password, data.name);
			await createFamilyForUser(store, res.user.id, data.familyName);
			setSessionCookie(res.sessionSecret);
			return { ok: true };
		}),
	);

export const signIn = createServerFn({ method: "POST" })
	.validator(credentialsSchema.extend({ password: z.string().min(1).max(128) }))
	.handler(({ data }) =>
		guard(async () => {
			const { getServerContext } = await import("./context");
			const { setSessionCookie, clientKey } = await import("./session");
			const { rateLimit } = await import("./rate-limit");
			const { audit } = await import("./services/family");
			rateLimit(`signin:${clientKey()}`, 10, 15 * 60_000);
			rateLimit(`signin:${data.email.toLowerCase()}`, 10, 15 * 60_000);
			const { auth, store } = getServerContext();
			const res = await auth.signIn(data.email, data.password);
			setSessionCookie(res.sessionSecret);
			await audit(store, { userId: res.user.id, familyId: null }, "auth.sign_in", `users/${res.user.id}`);
			return { ok: true };
		}),
	);

export const signOut = createServerFn({ method: "POST" }).handler(async () => {
	const { getCookie } = await import("@tanstack/react-start/server");
	const { getServerContext } = await import("./context");
	const { SESSION_COOKIE, clearSessionCookie } = await import("./session");
	const secret = getCookie(SESSION_COOKIE);
	if (secret) await getServerContext().auth.signOut(secret);
	clearSessionCookie();
	return { ok: true };
});

export const listStudentsFn = createServerFn({ method: "GET" }).handler(() =>
	guard(async () => {
		const { requireActor } = await import("./session");
		const { getServerContext } = await import("./context");
		const { listStudents } = await import("./services/family");
		const { actor } = await requireActor();
		const students = await listStudents(getServerContext().store, actor);
		return students.map((s) => ({ id: s.id, displayName: s.displayName, yearGroup: s.yearGroup }));
	}),
);

export const createStudentFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			displayName: displayNameSchema,
			yearGroup: yearGroupSchema,
			preferences: studentPreferencesSchema.optional(),
		}),
	)
	.handler(({ data }) =>
		guard(async () => {
			const { requireActor } = await import("./session");
			const { getServerContext } = await import("./context");
			const { createStudent } = await import("./services/family");
			const { actor } = await requireActor();
			const s = await createStudent(getServerContext().store, actor, {
				displayName: data.displayName,
				yearGroup: data.yearGroup,
				preferences: data.preferences ?? { readingSupport: false, theme: "calm" },
			});
			return { id: s.id };
		}),
	);

export const updateStudentFn = createServerFn({ method: "POST" })
	.validator(
		z.object({ studentId: idSchema, displayName: displayNameSchema.optional(), yearGroup: yearGroupSchema.optional() }),
	)
	.handler(({ data }) =>
		guard(async () => {
			const { requireActor } = await import("./session");
			const { getServerContext } = await import("./context");
			const { updateStudent } = await import("./services/family");
			const { actor } = await requireActor();
			const { studentId, ...patch } = data;
			await updateStudent(getServerContext().store, actor, studentId, patch);
			return { ok: true };
		}),
	);

export const deleteStudentFn = createServerFn({ method: "POST" })
	.validator(z.object({ studentId: idSchema, confirm: z.literal(true) }))
	.handler(({ data }) =>
		guard(async () => {
			const { requireActor } = await import("./session");
			const { getServerContext } = await import("./context");
			const { deleteStudent } = await import("./services/family");
			const { actor } = await requireActor();
			await deleteStudent(getServerContext().store, actor, data.studentId);
			return { ok: true };
		}),
	);

export const exportStudentFn = createServerFn({ method: "GET" })
	.validator(z.object({ studentId: idSchema }))
	.handler(({ data }) =>
		guard(async () => {
			const { requireActor } = await import("./session");
			const { getServerContext } = await import("./context");
			const { exportStudentData } = await import("./services/family");
			const { actor } = await requireActor();
			return JSON.stringify(await exportStudentData(getServerContext().store, actor, data.studentId));
		}),
	);

export const getProgressFn = createServerFn({ method: "GET" })
	.validator(z.object({ studentId: idSchema }))
	.handler(({ data }) =>
		guard(async () => {
			const { requireActor } = await import("./session");
			const { getServerContext } = await import("./context");
			const { getStudentProgress } = await import("./services/learning");
			const { actor } = await requireActor();
			return getStudentProgress({ store: getServerContext().store }, actor, data.studentId);
		}),
	);

export const overrideCompetencyFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			studentId: idSchema,
			objectiveCode: z.string().max(40),
			status: competencyStatusSchema.nullable(),
			reason: z.string().trim().min(3).max(500),
		}),
	)
	.handler(({ data }) =>
		guard(async () => {
			const { requireActor } = await import("./session");
			const { getServerContext } = await import("./context");
			const { overrideCompetency } = await import("./services/learning");
			const { actor } = await requireActor();
			await overrideCompetency({ store: getServerContext().store }, actor, data);
			return { ok: true };
		}),
	);

export const startSessionFn = createServerFn({ method: "POST" })
	.validator(z.object({ studentId: idSchema, objectiveCode: z.string().max(40), kind: sessionKindSchema }))
	.handler(({ data }) =>
		guard(async () => {
			const { requireActor } = await import("./session");
			const { getServerContext } = await import("./context");
			const { startSession } = await import("./services/learning");
			const { actor } = await requireActor();
			return startSession({ store: getServerContext().store }, actor, data);
		}),
	);

export const getSessionFn = createServerFn({ method: "GET" })
	.validator(z.object({ sessionId: idSchema }))
	.handler(({ data }) =>
		guard(async () => {
			const { requireActor } = await import("./session");
			const { getServerContext } = await import("./context");
			const { getSession } = await import("./services/learning");
			const { actor } = await requireActor();
			return getSession({ store: getServerContext().store }, actor, data.sessionId);
		}),
	);

export const sessionActionFn = createServerFn({ method: "POST" })
	.validator(
		z.discriminatedUnion("action", [
			z.object({ action: z.literal("answer"), sessionId: idSchema, response: answerInputSchema }),
			z.object({ action: z.literal("hint"), sessionId: idSchema }),
			z.object({ action: z.literal("continue"), sessionId: idSchema }),
		]),
	)
	.handler(({ data }) =>
		guard(async () => {
			const { requireActor } = await import("./session");
			const { getServerContext } = await import("./context");
			const learning = await import("./services/learning");
			const { actor } = await requireActor();
			const deps = { store: getServerContext().store };
			if (data.action === "answer") return learning.answerSession(deps, actor, data.sessionId, data.response);
			if (data.action === "hint") return learning.hintSession(deps, actor, data.sessionId);
			return learning.continueSession(deps, actor, data.sessionId);
		}),
	);

export const askTutorFn = createServerFn({ method: "POST" })
	.validator(z.object({ sessionId: idSchema }))
	.handler(({ data }) =>
		guard(async () => {
			const { requireActor } = await import("./session");
			const { getServerContext } = await import("./context");
			const { getSession } = await import("./services/learning");
			const { rateLimit } = await import("./rate-limit");
			const { createTutorAgent } = await import("#/ai/tutor-agent");
			const { AppError } = await import("./services/errors");
			const { actor } = await requireActor();
			const { config, store } = getServerContext();
			const session = await getSession({ store }, actor, data.sessionId);
			if (session.view.phase !== "instruction" && session.view.phase !== "guided") {
				throw new AppError("invalid", "The tutor can only help during teaching and guided practice.");
			}
			const agent = createTutorAgent(config, store, {
				studentId: session.studentId,
				objectiveCode: session.objective.code,
			});
			if (!agent) return { available: false as const, text: null };
			rateLimit(`ai:${actor.familyId}`, config.AI_DAILY_CALLS_PER_FAMILY, 24 * 60 * 60_000);
			const started = Date.now();
			const out = await agent.generate(
				"Explain the current objective to the child in a different way from the standard explanation, " +
					"using their recent mistakes if any. Maximum 6 short sentences. Do not answer any specific pending question.",
				{ maxSteps: 4 },
			);
			console.info("[ai-tutor] tutor call", { familyId: actor.familyId, ms: Date.now() - started, usage: out.usage });
			return { available: true as const, text: out.text.slice(0, 2000) };
		}),
	);
