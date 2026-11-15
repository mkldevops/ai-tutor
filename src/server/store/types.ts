import type {
	CompetencyStatus,
	EvidenceMode,
	FamilyRole,
	ItemType,
	SessionKind,
	StudentPreferences,
	YearGroup,
} from "#/domain/types";
import type { LessonState } from "#/learning-engine/lesson";

export type BaseRecord = { id: string; createdAt: string; updatedAt: string };

export type FamilyRecord = BaseRecord & { name: string; ownerUserId: string };
export type FamilyMemberRecord = BaseRecord & { familyId: string; userId: string; role: FamilyRole };
export type StudentRecord = BaseRecord & {
	familyId: string;
	displayName: string;
	yearGroup: YearGroup;
	preferences: StudentPreferences;
};
export type LearningSessionRecord = BaseRecord & {
	familyId: string;
	studentId: string;
	objectiveCode: string;
	kind: SessionKind;
	phase: string;
	state: LessonState;
	completedAt: string | null;
};
export type AttemptRecord = BaseRecord & {
	familyId: string;
	studentId: string;
	objectiveCode: string;
	sessionId: string;
	mode: EvidenceMode;
	itemType: ItemType;
	prompt: string;
	expected: string;
	response: string;
	correct: boolean;
	hintsUsed: number;
};
export type CompetencyRecord = BaseRecord & {
	familyId: string;
	studentId: string;
	objectiveCode: string;
	status: CompetencyStatus;
	computedStatus: CompetencyStatus;
	reasons: string[];
	securedAt: string | null;
	override: { status: CompetencyStatus; reason: string; byUserId: string; at: string } | null;
};
export type MasteryEventRecord = BaseRecord & {
	familyId: string;
	studentId: string;
	objectiveCode: string;
	fromStatus: CompetencyStatus;
	toStatus: CompetencyStatus;
	actor: "system" | "parent";
	actorUserId: string | null;
	reason: string;
};
export type RevisionScheduleRecord = BaseRecord & {
	familyId: string;
	studentId: string;
	objectiveCode: string;
	dueAt: string;
	status: "pending" | "done" | "superseded";
};
export type AuditLogRecord = BaseRecord & {
	familyId: string | null;
	actorUserId: string | null;
	action: string;
	target: string;
	detail: Record<string, unknown>;
};

export type TableMap = {
	families: FamilyRecord;
	family_members: FamilyMemberRecord;
	students: StudentRecord;
	learning_sessions: LearningSessionRecord;
	assessment_attempts: AttemptRecord;
	student_competencies: CompetencyRecord;
	mastery_events: MasteryEventRecord;
	revision_schedules: RevisionScheduleRecord;
	audit_logs: AuditLogRecord;
};
export type TableName = keyof TableMap;

export type NewRecord<T extends BaseRecord> = Omit<T, keyof BaseRecord>;
export type Filter<T> = Partial<
	Pick<T, { [K in keyof T]: T[K] extends string | number | boolean | null ? K : never }[keyof T]>
>;

export interface Table<T extends BaseRecord> {
	get(id: string): Promise<T | null>;
	list(filter: Filter<T>, opts?: { limit?: number; orderBy?: "createdAt" }): Promise<T[]>;
	create(data: NewRecord<T>): Promise<T>;
	update(id: string, patch: Partial<NewRecord<T>>): Promise<T>;
	delete(id: string): Promise<void>;
}

export type DataStore = { [K in TableName]: Table<TableMap[K]> };

export const JSON_COLUMNS: { [K in TableName]?: (keyof TableMap[K])[] } = {
	students: ["preferences"],
	learning_sessions: ["state"],
	student_competencies: ["reasons", "override"],
	audit_logs: ["detail"],
};
