import { type ProgrammeSettings, programmeSettingsSchema } from "#/domain/types";
import type { StudentRecord } from "../store/types";

export function programmeSettingsOf(student: Pick<StudentRecord, "programme">): ProgrammeSettings {
	return programmeSettingsSchema.parse(student.programme ?? {});
}

export function skippedCodes(student: Pick<StudentRecord, "programme">): string[] {
	return programmeSettingsOf(student).skips.map((s) => s.objectiveCode);
}
