import { type ProgrammeSettings, programmeSettingsSchema } from "#/domain/types";
import type { StudentRecord } from "../store/types";

export function programmeSettingsOf(student: Pick<StudentRecord, "programme">): ProgrammeSettings {
	return programmeSettingsSchema.parse(student.programme ?? {});
}
