import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { PIN_PATTERN } from "#/domain/parent-lock";
import {
	answerInputSchema,
	competencyStatusSchema,
	confidenceMomentSchema,
	confidenceValueSchema,
	displayNameSchema,
	PROGRAMME_SKIP_REASON_MAX,
	programmeSettingsSchema,
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
		if (e instanceof AppError) {
			if (e.code === "parent_locked") {
				const { setResponseStatus } = await import("@tanstack/react-start/server");
				setResponseStatus(403);
			}
			throw new Error(e.message);
		}
		const { AuthError } = await import("./auth/provider");
		if (e instanceof AuthError) throw new Error(e.message);
		console.error("[ai-tutor] unexpected error", e);
		throw new Error("Something went wrong. Please try again.");
	}
}

export const getMe = createServerFn({ method: "GET" }).handler(async () => {
	const { currentUser, isKnowledgeAdmin, parentState } = await import("./session");
	const { getServerContext } = await import("./context");
	const { resolveActor } = await import("./services/family");
	const user = await currentUser();
	if (!user) return null;
	const actor = await resolveActor(getServerContext().store, user.id);
	const parent = actor ? await parentState(actor) : { pinSet: false, unlocked: true };
	return {
		user: { id: user.id, email: user.email, name: user.name },
		familyId: actor?.familyId ?? null,
		role: actor?.role ?? null,
		isKnowledgeAdmin: isKnowledgeAdmin(user),
		parent: { pinSet: parent.pinSet, unlocked: parent.unlocked },
	};
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
			const { auth, store } = getServerContext();
			await rateLimit(`signup:${clientKey()}`, 5, 60 * 60_000);
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
			const { auth, store } = getServerContext();
			await rateLimit(`signin:${clientKey()}`, 10, 15 * 60_000);
			await rateLimit(`signin:${data.email.toLowerCase()}`, 10, 15 * 60_000);
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

const pinInput = z.string().regex(PIN_PATTERN, "Use 4 to 8 digits");

export const unlockParentFn = createServerFn({ method: "POST" })
	.validator(z.object({ pin: pinInput }))
	.handler(({ data }) =>
		guard(async () => {
			const { requireActor, grantParentUnlock } = await import("./session");
			const { getServerContext } = await import("./context");
			const { unlockParentArea } = await import("./services/parent-lock");
			const { actor } = await requireActor();
			const { store, auth } = getServerContext();
			const family = await unlockParentArea({ store, auth }, actor, data.pin);
			if (family) grantParentUnlock(family);
			return { ok: true };
		}),
	);

export const lockParentFn = createServerFn({ method: "POST" }).handler(async () => {
	const { clearParentUnlock } = await import("./session");
	clearParentUnlock();
	return { ok: true };
});

export const setParentPinFn = createServerFn({ method: "POST" })
	.validator(z.object({ password: z.string().min(1).max(128), pin: pinInput }))
	.handler(({ data }) =>
		guard(async () => {
			const { requireActor, grantParentUnlock } = await import("./session");
			const { getServerContext } = await import("./context");
			const { setParentPin } = await import("./services/parent-lock");
			const { user, actor } = await requireActor();
			const { store, auth } = getServerContext();
			const family = await setParentPin({ store, auth }, user, actor, data);
			grantParentUnlock(family);
			return { ok: true };
		}),
	);

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

export const getFamilyOverviewFn = createServerFn({ method: "GET" }).handler(() =>
	guard(async () => {
		const { requireParent } = await import("./session");
		const { getServerContext } = await import("./context");
		const { getFamilyOverview } = await import("./services/overview");
		const { actor } = await requireParent();
		return getFamilyOverview({ store: getServerContext().store }, actor);
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
			const { requireParent } = await import("./session");
			const { getServerContext } = await import("./context");
			const { createStudent } = await import("./services/family");
			const { actor } = await requireParent();
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
			const { requireParent } = await import("./session");
			const { getServerContext } = await import("./context");
			const { updateStudent } = await import("./services/family");
			const { actor } = await requireParent();
			const { studentId, ...patch } = data;
			await updateStudent(getServerContext().store, actor, studentId, patch);
			return { ok: true };
		}),
	);

export const setStudentVoiceFn = createServerFn({ method: "POST" })
	.validator(z.object({ studentId: idSchema, enabled: z.boolean() }))
	.handler(({ data }) =>
		guard(async () => {
			const { requireParent } = await import("./session");
			const { getServerContext } = await import("./context");
			const { setStudentVoice } = await import("./services/family");
			const { actor } = await requireParent();
			const prefs = await setStudentVoice(getServerContext().store, actor, data.studentId, data.enabled);
			return { voice: prefs.voice === true };
		}),
	);

export const setPaceTargetFn = createServerFn({ method: "POST" })
	.validator(z.object({ studentId: idSchema, paceTarget: programmeSettingsSchema.shape.paceTarget.unwrap() }))
	.handler(({ data }) =>
		guard(async () => {
			const { requireParent } = await import("./session");
			const { getServerContext } = await import("./context");
			const { setPaceTarget } = await import("./services/pace");
			const { actor } = await requireParent();
			const programme = await setPaceTarget(getServerContext().store, actor, data.studentId, data.paceTarget);
			return { paceTarget: programme.paceTarget };
		}),
	);

export const speakFn = createServerFn({ method: "POST" })
	.validator(z.object({ text: z.string().min(1).max(600) }))
	.handler(({ data }) =>
		guard(async () => {
			const { requireActor } = await import("./session");
			const { getServerContext } = await import("./context");
			const { rateLimit } = await import("./rate-limit");
			const { synthesize } = await import("./speech/speech");
			const { actor } = await requireActor();
			const { config, speechCache } = getServerContext();
			if (!config.ELEVENLABS_API_KEY) return { audio: null, status: "off" as const };
			try {
				const audio = await synthesize(
					{
						cache: speechCache,
						apiKey: config.ELEVENLABS_API_KEY,
						voiceId: config.ELEVENLABS_VOICE_ID,
						modelId: config.ELEVENLABS_MODEL,
						beforeGenerate: () =>
							rateLimit(`speech:${actor.familyId}`, config.SPEECH_HOURLY_CLIPS_PER_FAMILY, 60 * 60_000),
					},
					data.text,
				);
				if (!audio) return { audio: null, status: "skipped" as const };
				return { audio: Buffer.from(audio).toString("base64"), status: "ok" as const };
			} catch (e) {
				console.warn("[ai-tutor] speech fell back to the browser voice", e instanceof Error ? e.message : e);
				return { audio: null, status: "busy" as const };
			}
		}),
	);

export const deleteStudentFn = createServerFn({ method: "POST" })
	.validator(z.object({ studentId: idSchema, confirmName: z.string().max(60) }))
	.handler(({ data }) =>
		guard(async () => {
			const { requireParent } = await import("./session");
			const { getServerContext } = await import("./context");
			const { rateLimit } = await import("./rate-limit");
			const { deleteStudent } = await import("./services/deletion");
			const { actor } = await requireParent();
			await rateLimit(`delete-student:${actor.userId}`, 10, 60 * 60_000);
			await deleteStudent(getServerContext().store, actor, data.studentId, data.confirmName);
			return { ok: true };
		}),
	);

export const deleteAccountFn = createServerFn({ method: "POST" })
	.validator(z.object({ confirmEmail: z.string().max(254) }))
	.handler(({ data }) =>
		guard(async () => {
			const { currentUser, clearSessionCookie, assertParentUnlocked } = await import("./session");
			const { getServerContext } = await import("./context");
			const { rateLimit } = await import("./rate-limit");
			const { AppError } = await import("./services/errors");
			const { deleteAccount } = await import("./services/deletion");
			const { resolveActor } = await import("./services/family");
			const user = await currentUser();
			if (!user) throw new AppError("unauthenticated", "Please sign in.");
			const actor = await resolveActor(getServerContext().store, user.id);
			if (actor) await assertParentUnlocked(actor);
			await rateLimit(`delete-account:${user.id}`, 5, 60 * 60_000);
			const { store, auth } = getServerContext();
			await deleteAccount({ store, auth }, user, data.confirmEmail);
			clearSessionCookie();
			return { ok: true };
		}),
	);

export const exportStudentFn = createServerFn({ method: "GET" })
	.validator(z.object({ studentId: idSchema }))
	.handler(({ data }) =>
		guard(async () => {
			const { requireParent } = await import("./session");
			const { getServerContext } = await import("./context");
			const { exportStudentData } = await import("./services/family");
			const { actor } = await requireParent();
			return JSON.stringify(await exportStudentData(getServerContext().store, actor, data.studentId));
		}),
	);

export const getProgressFn = createServerFn({ method: "GET" })
	.validator(z.object({ studentId: idSchema }))
	.handler(({ data }) =>
		guard(async () => {
			const { requireActor, parentState } = await import("./session");
			const { getServerContext } = await import("./context");
			const { getStudentProgress, childProgress } = await import("./services/learning");
			const { actor } = await requireActor();
			const progress = await getStudentProgress({ store: getServerContext().store }, actor, data.studentId);
			return (await parentState(actor)).unlocked ? progress : childProgress(progress);
		}),
	);

export const getMissionFn = createServerFn({ method: "GET" })
	.validator(z.object({ studentId: idSchema }))
	.handler(({ data }) =>
		guard(async () => {
			const { requireActor } = await import("./session");
			const { getServerContext } = await import("./context");
			const { getMission } = await import("./services/mission");
			const { actor } = await requireActor();
			return getMission({ store: getServerContext().store }, actor, data.studentId);
		}),
	);

export const getOutcomesFn = createServerFn({ method: "GET" })
	.validator(z.object({ studentId: idSchema }))
	.handler(({ data }) =>
		guard(async () => {
			const { requireParent } = await import("./session");
			const { getServerContext } = await import("./context");
			const { getStudentOutcomes } = await import("./services/longitudinal");
			const { actor } = await requireParent();
			return getStudentOutcomes({ store: getServerContext().store }, actor, data.studentId);
		}),
	);

export const getProgrammeReportFn = createServerFn({ method: "GET" })
	.validator(z.object({ studentId: idSchema }))
	.handler(({ data }) =>
		guard(async () => {
			const { requireParent } = await import("./session");
			const { getServerContext } = await import("./context");
			const { getProgrammeReport } = await import("./services/programme-report");
			const { actor } = await requireParent();
			return getProgrammeReport({ store: getServerContext().store }, actor, data.studentId);
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
			const { requireParent } = await import("./session");
			const { getServerContext } = await import("./context");
			const { overrideCompetency } = await import("./services/learning");
			const { actor } = await requireParent();
			await overrideCompetency({ store: getServerContext().store }, actor, data);
			return { ok: true };
		}),
	);

export const setProgrammePausedFn = createServerFn({ method: "POST" })
	.validator(z.object({ studentId: idSchema, paused: z.boolean() }))
	.handler(({ data }) =>
		guard(async () => {
			const { requireParent } = await import("./session");
			const { getServerContext } = await import("./context");
			const { setProgrammePaused } = await import("./services/programme-controls");
			const { actor } = await requireParent();
			await setProgrammePaused({ store: getServerContext().store }, actor, data.studentId, data.paused);
			return { ok: true };
		}),
	);

export const setDailyNewStepCapFn = createServerFn({ method: "POST" })
	.validator(z.object({ studentId: idSchema, enabled: z.boolean() }))
	.handler(({ data }) =>
		guard(async () => {
			const { requireParent } = await import("./session");
			const { getServerContext } = await import("./context");
			const { setDailyNewStepCap } = await import("./services/programme-controls");
			const { actor } = await requireParent();
			const programme = await setDailyNewStepCap(
				{ store: getServerContext().store },
				actor,
				data.studentId,
				data.enabled,
			);
			return { dailyNewStepCap: programme.dailyNewStepCap };
		}),
	);

export const skipProgrammeStepFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			studentId: idSchema,
			objectiveCode: z.string().max(40),
			reason: z.string().trim().min(3).max(PROGRAMME_SKIP_REASON_MAX),
		}),
	)
	.handler(({ data }) =>
		guard(async () => {
			const { requireParent } = await import("./session");
			const { getServerContext } = await import("./context");
			const { skipProgrammeStep } = await import("./services/programme-controls");
			const { actor } = await requireParent();
			await skipProgrammeStep({ store: getServerContext().store }, actor, data);
			return { ok: true };
		}),
	);

export const undoProgrammeSkipFn = createServerFn({ method: "POST" })
	.validator(z.object({ studentId: idSchema, objectiveCode: z.string().max(40) }))
	.handler(({ data }) =>
		guard(async () => {
			const { requireParent } = await import("./session");
			const { getServerContext } = await import("./context");
			const { undoProgrammeSkip } = await import("./services/programme-controls");
			const { actor } = await requireParent();
			await undoProgrammeSkip({ store: getServerContext().store }, actor, data);
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
			z.object({
				action: z.literal("confidence"),
				sessionId: idSchema,
				moment: confidenceMomentSchema,
				value: confidenceValueSchema,
			}),
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
			if (data.action === "confidence") return learning.rateConfidence(deps, actor, data);
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
			const { generateCheckedAnswer } = await import("#/ai/checked-answer");
			const { AppError } = await import("./services/errors");
			const { actor } = await requireActor();
			const { config, store, index, embedder } = getServerContext();
			const session = await getSession({ store }, actor, data.sessionId);
			if (session.view.phase !== "instruction" && session.view.phase !== "guided") {
				throw new AppError("invalid", "The tutor can only help during teaching and guided practice.");
			}
			const agent = createTutorAgent(
				config,
				store,
				{
					studentId: session.studentId,
					objectiveCode: session.objective.code,
				},
				{ index, embedder },
			);
			if (!agent) return { available: false as const, text: null };
			await rateLimit(`ai:${actor.familyId}`, config.AI_DAILY_CALLS_PER_FAMILY, 24 * 60 * 60_000);
			const started = Date.now();
			let usage: unknown[] = [];
			const res = await generateCheckedAnswer(async (prompt) => {
				const out = await agent.generate(prompt, { maxSteps: 4 });
				usage = [...usage, out.usage];
				return out;
			}, "Explain the current objective to the child in a different way from the standard explanation, " +
				"using their recent mistakes if any. Maximum 6 short sentences. Do not answer any specific pending question.");
			console.info("[ai-tutor] tutor call", {
				familyId: actor.familyId,
				ms: Date.now() - started,
				attempts: res.attempts,
				arithmeticErrors: res.errors.length,
				usage,
			});
			return { available: true as const, text: res.text.slice(0, 2000) };
		}),
	);

export const getTutorChatFn = createServerFn({ method: "GET" })
	.validator(z.object({ sessionId: idSchema }))
	.handler(({ data }) =>
		guard(async () => {
			const { requireActor } = await import("./session");
			const { getServerContext } = await import("./context");
			const { listTutorMessages } = await import("./services/tutor-chat");
			const { actor } = await requireActor();
			const { config, store } = getServerContext();
			const enabled = config.AI_ENABLED && !!config.AI_API_KEY;
			return { enabled, messages: enabled ? await listTutorMessages(store, actor, data.sessionId) : [] };
		}),
	);

export const listWorksheetChecksFn = createServerFn({ method: "GET" })
	.validator(z.object({ studentId: idSchema }))
	.handler(({ data }) =>
		guard(async () => {
			const { requireParent } = await import("./session");
			const { getServerContext } = await import("./context");
			const { listWorksheetChecks } = await import("./services/worksheets");
			const { actor } = await requireParent();
			const { config, store } = getServerContext();
			return {
				enabled: config.VISION_ENABLED && !!config.AI_API_KEY,
				checks: await listWorksheetChecks(store, actor, data.studentId),
			};
		}),
	);

export const checkWorksheetPhotoFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			studentId: idSchema,
			objectiveCode: z.string().max(40),
			mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
			imageBase64: z.string().min(1).max(4_194_304),
		}),
	)
	.handler(({ data }) =>
		guard(async () => {
			const { requireParent } = await import("./session");
			const { getServerContext } = await import("./context");
			const { rateLimit } = await import("./rate-limit");
			const { createWorksheetReader } = await import("#/ai/vision-agent");
			const { checkWorksheetPhoto } = await import("./services/worksheets");
			const { AppError } = await import("./services/errors");
			const { actor } = await requireParent();
			const { config, store } = getServerContext();
			const reader = createWorksheetReader(config);
			if (!reader) throw new AppError("invalid", "Worksheet photo checks are turned off.");
			await rateLimit(`vision:${actor.familyId}`, config.VISION_DAILY_CHECKS_PER_FAMILY, 24 * 60 * 60_000);
			const started = Date.now();
			const check = await checkWorksheetPhoto({ store, reader }, actor, data);
			console.info("[ai-tutor] worksheet check", { familyId: actor.familyId, ms: Date.now() - started });
			return check;
		}),
	);

export const reviewWorksheetCheckFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			checkId: idSchema,
			corrections: z
				.array(z.object({ index: z.number().int().min(0).max(29), childAnswer: z.string().max(60) }))
				.max(30),
			parentNote: z.string().trim().max(500).nullable(),
		}),
	)
	.handler(({ data }) =>
		guard(async () => {
			const { requireParent } = await import("./session");
			const { getServerContext } = await import("./context");
			const { reviewWorksheetCheck } = await import("./services/worksheets");
			const { actor } = await requireParent();
			return reviewWorksheetCheck(getServerContext().store, actor, data.checkId, {
				corrections: data.corrections,
				parentNote: data.parentNote || null,
			});
		}),
	);

export const deleteWorksheetCheckFn = createServerFn({ method: "POST" })
	.validator(z.object({ checkId: idSchema }))
	.handler(({ data }) =>
		guard(async () => {
			const { requireParent } = await import("./session");
			const { getServerContext } = await import("./context");
			const { deleteWorksheetCheck } = await import("./services/worksheets");
			const { actor } = await requireParent();
			await deleteWorksheetCheck(getServerContext().store, actor, data.checkId);
			return { ok: true };
		}),
	);

export const getKnowledgeOverviewFn = createServerFn({ method: "GET" }).handler(() =>
	guard(async () => {
		const { requireKnowledgeAdmin } = await import("./session");
		const { getServerContext } = await import("./context");
		const { getKnowledgeOverview } = await import("#/knowledge/ingestion");
		await requireKnowledgeAdmin();
		const { store, index, embedder } = getServerContext();
		return { sources: await getKnowledgeOverview(store), index: index.kind, embedder: embedder.id };
	}),
);

export const getKnowledgeVersionFn = createServerFn({ method: "GET" })
	.validator(z.object({ versionId: idSchema }))
	.handler(({ data }) =>
		guard(async () => {
			const { requireKnowledgeAdmin } = await import("./session");
			const { getServerContext } = await import("./context");
			const { getVersionDetail } = await import("#/knowledge/ingestion");
			await requireKnowledgeAdmin();
			return getVersionDetail(getServerContext().store, data.versionId);
		}),
	);

export const runIngestionFn = createServerFn({ method: "POST" })
	.validator(z.object({ sourceKey: z.string().regex(/^[a-z0-9-]{1,60}$/) }))
	.handler(({ data }) =>
		guard(async () => {
			const { requireKnowledgeAdmin } = await import("./session");
			const { getServerContext } = await import("./context");
			const { rateLimit } = await import("./rate-limit");
			const { runIngestion } = await import("#/knowledge/ingestion");
			const { createSafeJsonFetcher } = await import("#/knowledge/fetcher");
			const user = await requireKnowledgeAdmin();
			await rateLimit(`ingest:${data.sourceKey}`, 6, 60 * 60_000);
			const { store, index, embedder } = getServerContext();
			const job = await runIngestion({ store, index, embedder, fetchJson: createSafeJsonFetcher() }, data.sourceKey, {
				trigger: "manual",
				actorUserId: user.id,
			});
			return { status: job.status, error: job.error, versionId: job.versionId };
		}),
	);

export const reviewKnowledgeVersionFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			versionId: idSchema,
			decision: z.enum(["approve", "reject"]),
			note: z.string().trim().min(3).max(500),
		}),
	)
	.handler(({ data }) =>
		guard(async () => {
			const { requireKnowledgeAdmin } = await import("./session");
			const { getServerContext } = await import("./context");
			const { reviewVersion } = await import("#/knowledge/ingestion");
			const user = await requireKnowledgeAdmin();
			const { store, index, embedder } = getServerContext();
			const v = await reviewVersion({ store, index, embedder }, user.id, data.versionId, data.decision, data.note);
			return { status: v.status };
		}),
	);

export const printableSheetSchema = z.object({
	studentId: idSchema,
	objectiveCode: z.string().regex(/^[A-Z0-9-]{3,40}$/),
	seed: z.string().regex(/^[A-Za-z0-9-]{4,64}$/),
	count: z.number().int().min(4).max(20),
	difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable(),
	variant: z.enum(["worksheet", "answer_key"]),
});

export const getPrintableSheetFn = createServerFn({ method: "GET" })
	.validator(printableSheetSchema)
	.handler(({ data }) =>
		guard(async () => {
			const { requireParent } = await import("./session");
			const { getServerContext } = await import("./context");
			const { getPrintableSheet } = await import("./services/printables");
			const { actor } = await requireParent();
			return getPrintableSheet(getServerContext().store, actor, data);
		}),
	);
