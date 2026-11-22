import { z } from "zod";

export const LESSON_EXPIRY_DAYS = 14;

const envSchema = z
	.object({
		NODE_ENV: z.string().default("development"),
		DATA_BACKEND: z.enum(["memory", "appwrite"]).default("memory"),
		ALLOW_MEMORY_BACKEND_IN_PRODUCTION: z.stringbool().default(false),
		APPWRITE_ENDPOINT: z.url().optional(),
		APPWRITE_PROJECT_ID: z.string().optional(),
		APPWRITE_API_KEY: z.string().optional(),
		APPWRITE_DATABASE_ID: z.string().default("ai_tutor"),
		AI_ENABLED: z.stringbool().default(false),
		AI_MODEL: z
			.string()
			.regex(/^[a-z0-9-]+(\/[A-Za-z0-9._:-]+)+$/)
			.default("anthropic/claude-sonnet-5-5"),
		AI_API_KEY: z.string().optional(),
		AI_DAILY_CALLS_PER_FAMILY: z.coerce.number().int().min(0).default(50),
		VISION_ENABLED: z.stringbool().default(false),
		VISION_MODEL: z
			.string()
			.regex(/^[a-z0-9-]+(\/[A-Za-z0-9._:-]+)+$/)
			.default("openrouter/deepseek/deepseek-v4.1-flash"),
		VISION_DAILY_CHECKS_PER_FAMILY: z.coerce.number().int().min(0).default(20),
		SESSION_COOKIE_SECURE: z.stringbool().optional(),
		PARENT_LOCK_SECRET: z.string().min(32).optional(),
		KNOWLEDGE_INDEX: z.enum(["memory", "qdrant"]).default("memory"),
		QDRANT_URL: z.url().optional(),
		QDRANT_API_KEY: z.string().optional(),
		QDRANT_COLLECTION: z
			.string()
			.regex(/^[a-z0-9_]+$/)
			.default("ai_tutor_knowledge"),
		KNOWLEDGE_ADMIN_EMAILS: z
			.string()
			.default("")
			.transform((v) =>
				v
					.split(",")
					.map((e) => e.trim().toLowerCase())
					.filter(Boolean),
			),
		KNOWLEDGE_AUTO_CHECK: z.stringbool().default(false),
		ELEVENLABS_API_KEY: z
			.string()
			.optional()
			.transform((v) => v?.trim() || undefined),
		ELEVENLABS_VOICE_ID: z
			.string()
			.regex(/^[A-Za-z0-9]{10,40}$/)
			.default("JBFqnCBsd6RMkjVDRZzb"),
		ELEVENLABS_MODEL: z
			.string()
			.regex(/^[a-z0-9_]+$/)
			.default("eleven_flash_v2_5"),
		SPEECH_HOURLY_CLIPS_PER_FAMILY: z.coerce.number().int().min(1).default(200),
		RATE_LIMIT_BACKEND: z.enum(["memory", "appwrite"]).optional(),
		RETENTION_PURGE_ENABLED: z.stringbool().default(false),
		RETENTION_OPEN_SESSION_DAYS: z.coerce.number().int().min(LESSON_EXPIRY_DAYS).max(3650).default(30),
		RETENTION_WORKSHEET_CHECK_DAYS: z.coerce.number().int().min(1).max(3650).default(90),
		RETENTION_AUDIT_LOG_DAYS: z.coerce.number().int().min(30).max(3650).default(400),
		RETENTION_EVIDENCE_DAYS: z.coerce.number().int().min(0).max(3650).default(0),
		RETENTION_SESSION_MESSAGES_DAYS: z.coerce.number().int().min(1).max(365).default(30),
	})
	.superRefine((env, ctx) => {
		if (env.DATA_BACKEND === "appwrite") {
			for (const key of ["APPWRITE_ENDPOINT", "APPWRITE_PROJECT_ID", "APPWRITE_API_KEY"] as const) {
				if (!env[key]) ctx.addIssue({ code: "custom", path: [key], message: "Required when DATA_BACKEND=appwrite" });
			}
		}
		if (env.DATA_BACKEND === "memory" && env.NODE_ENV === "production" && !env.ALLOW_MEMORY_BACKEND_IN_PRODUCTION) {
			ctx.addIssue({ code: "custom", path: ["DATA_BACKEND"], message: "memory backend is not allowed in production" });
		}
		if (env.RATE_LIMIT_BACKEND === "appwrite" && env.DATA_BACKEND !== "appwrite") {
			ctx.addIssue({
				code: "custom",
				path: ["RATE_LIMIT_BACKEND"],
				message: "appwrite rate limits need DATA_BACKEND=appwrite",
			});
		}
		if (env.RETENTION_EVIDENCE_DAYS > 0 && env.RETENTION_EVIDENCE_DAYS < 365) {
			ctx.addIssue({
				code: "custom",
				path: ["RETENTION_EVIDENCE_DAYS"],
				message: "Learning evidence is kept at least 365 days (0 keeps it until the learner is deleted)",
			});
		}
		if (env.KNOWLEDGE_INDEX === "qdrant" && !env.QDRANT_URL) {
			ctx.addIssue({ code: "custom", path: ["QDRANT_URL"], message: "Required when KNOWLEDGE_INDEX=qdrant" });
		}
		if (env.NODE_ENV === "production" && env.AI_MODEL.startsWith("fake/")) {
			ctx.addIssue({ code: "custom", path: ["AI_MODEL"], message: "fake/ models are for tests only" });
		}
		if ((env.AI_ENABLED || env.VISION_ENABLED) && !env.AI_API_KEY) {
			ctx.addIssue({ code: "custom", path: ["AI_API_KEY"], message: "Required when AI_ENABLED or VISION_ENABLED" });
		}
	});

export type AppConfig = Omit<z.infer<typeof envSchema>, "RATE_LIMIT_BACKEND"> & {
	RATE_LIMIT_BACKEND: "memory" | "appwrite";
};

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
	const parsed = envSchema.safeParse(env);
	if (!parsed.success) {
		throw new Error(`Invalid environment: ${z.prettifyError(parsed.error)}`);
	}
	return { ...parsed.data, RATE_LIMIT_BACKEND: parsed.data.RATE_LIMIT_BACKEND ?? parsed.data.DATA_BACKEND };
}
