import { z } from "zod";

export const yearGroupSchema = z.union([z.literal(3), z.literal(5)]);
export type YearGroup = z.infer<typeof yearGroupSchema>;

export const subjectSchema = z.enum(["maths", "english"]);
export type Subject = z.infer<typeof subjectSchema>;

export const familyRoleSchema = z.enum(["owner", "parent"]);
export type FamilyRole = z.infer<typeof familyRoleSchema>;

export const evidenceModeSchema = z.enum(["diagnostic", "guided", "independent", "review"]);
export type EvidenceMode = z.infer<typeof evidenceModeSchema>;

export const itemTypeSchema = z.enum(["numeric", "multiple_choice", "missing_number", "word_problem", "written"]);
export type ItemType = z.infer<typeof itemTypeSchema>;

export const competencyStatusSchema = z.enum([
	"not_started",
	"emerging",
	"developing",
	"secure",
	"mastered",
	"needs_review",
]);
export type CompetencyStatus = z.infer<typeof competencyStatusSchema>;

export const lessonPhaseSchema = z.enum(["diagnostic", "instruction", "guided", "independent", "review", "complete"]);
export type LessonPhase = z.infer<typeof lessonPhaseSchema>;

export const sessionKindSchema = z.enum(["lesson", "review", "extra"]);
export type SessionKind = z.infer<typeof sessionKindSchema>;

export const confidenceValueSchema = z.number().int().min(1).max(5);
export const confidenceMomentSchema = z.enum(["before", "after"]);
export type ConfidenceMoment = z.infer<typeof confidenceMomentSchema>;
export type Confidence = { before?: number; after?: number };

export const studentPreferencesSchema = z.object({
	readingSupport: z.boolean().default(false),
	theme: z.enum(["calm", "bright"]).default("calm"),
	voice: z.boolean().optional(),
});
export type StudentPreferences = z.infer<typeof studentPreferencesSchema>;

export const displayNameSchema = z
	.string()
	.trim()
	.min(1, "Required")
	.max(40, "40 characters max")
	.regex(/^[\p{L}\p{N} '-]+$/u, "Letters, numbers, spaces only");

export const sourceProvenanceSchema = z.object({
	publisher: z.string(),
	title: z.string(),
	reference: z.string().optional(),
	url: z.url(),
	publishedAt: z.string(),
	lastUpdatedAt: z.string().optional(),
	retrievedAt: z.string(),
	verification: z.enum(["verbatim_checked", "unverified"]),
	licence: z.string(),
});
export type SourceProvenance = z.infer<typeof sourceProvenanceSchema>;

export type Item = {
	id: string;
	objectiveCode: string;
	type: ItemType;
	difficulty: 1 | 2 | 3;
	prompt: string;
	choices?: string[];
	answer: string;
	accept?: string[];
	hint: string;
	workedSolution: string;
};

export type PublicItem = Pick<Item, "id" | "objectiveCode" | "type" | "difficulty" | "prompt" | "choices">;

export function toPublicItem(item: Item): PublicItem {
	return {
		id: item.id,
		objectiveCode: item.objectiveCode,
		type: item.type,
		difficulty: item.difficulty,
		prompt: item.prompt,
		...(item.choices ? { choices: item.choices } : {}),
	};
}

export const answerInputSchema = z.string().trim().min(1).max(64);
