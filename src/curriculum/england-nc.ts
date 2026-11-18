import type { Subject } from "#/domain/types";
import { ENGLISH_LESSON_OBJECTIVES_BY_YEAR, ENGLISH_OBJECTIVES, ENGLISH_PREREQUISITES } from "./england-nc-english.ts";
import {
	type CurriculumObjective,
	MATHS_LESSON_OBJECTIVES_BY_YEAR,
	MATHS_OBJECTIVES,
	MATHS_PREREQUISITES,
	type PrerequisiteEdge,
} from "./england-nc-maths.ts";

export { type CurriculumObjective, ENGLAND_NC, ENGLAND_NC_CODE, type PrerequisiteEdge } from "./england-nc-maths.ts";

export const SUBJECTS: readonly Subject[] = ["maths", "english"];

export const OBJECTIVES: CurriculumObjective[] = [...MATHS_OBJECTIVES, ...ENGLISH_OBJECTIVES];

export const PREREQUISITES: PrerequisiteEdge[] = [...MATHS_PREREQUISITES, ...ENGLISH_PREREQUISITES];

export const LESSON_OBJECTIVES_BY_YEAR: Record<3 | 5, string[]> = {
	3: [...MATHS_LESSON_OBJECTIVES_BY_YEAR[3], ...ENGLISH_LESSON_OBJECTIVES_BY_YEAR[3]],
	5: [...MATHS_LESSON_OBJECTIVES_BY_YEAR[5], ...ENGLISH_LESSON_OBJECTIVES_BY_YEAR[5]],
};

export function getObjective(code: string): CurriculumObjective | undefined {
	return OBJECTIVES.find((o) => o.code === code);
}

export function getPrerequisiteCodes(code: string): string[] {
	return PREREQUISITES.filter((e) => e.objectiveCode === code).map((e) => e.prerequisiteCode);
}
