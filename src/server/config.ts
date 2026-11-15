import { z } from "zod";

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
		if (env.KNOWLEDGE_INDEX === "qdrant" && !env.QDRANT_URL) {
			ctx.addIssue({ code: "custom", path: ["QDRANT_URL"], message: "Required when KNOWLEDGE_INDEX=qdrant" });
		}
		if ((env.AI_ENABLED || env.VISION_ENABLED) && !env.AI_API_KEY) {
			ctx.addIssue({ code: "custom", path: ["AI_API_KEY"], message: "Required when AI_ENABLED or VISION_ENABLED" });
		}
	});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
	const parsed = envSchema.safeParse(env);
	if (!parsed.success) {
		throw new Error(`Invalid environment: ${z.prettifyError(parsed.error)}`);
	}
	return parsed.data;
}
