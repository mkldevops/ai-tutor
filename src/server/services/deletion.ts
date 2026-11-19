import type { AuthProvider, AuthUser } from "../auth/provider";
import type { BaseRecord, DataStore, Filter, Table, TableName } from "../store/types";
import { AppError } from "./errors";
import { type Actor, audit, requireStudent, resolveActor, STUDENT_OWNED } from "./family";

const PAGE = 100;

export type DeletionCounts = Partial<Record<TableName, number>>;

const isNotFound = (e: unknown) => (e as { code?: number }).code === 404;

async function removeRow<T extends BaseRecord>(table: Table<T>, id: string) {
	try {
		await table.delete(id);
	} catch (e) {
		if (!isNotFound(e)) throw e;
	}
}

async function sweep<T extends BaseRecord>(table: Table<T>, filter: Filter<T>): Promise<number> {
	let count = 0;
	const seen = new Set<string>();
	for (;;) {
		const rows = await table.list(filter, { limit: PAGE });
		if (rows.length === 0) return count;
		const fresh = rows.filter((r) => !seen.has(r.id));
		if (fresh.length === 0) throw new Error("Deletion made no progress; retry later.");
		for (const r of fresh) {
			seen.add(r.id);
			await removeRow(table, r.id);
			count += 1;
		}
	}
}

function add(counts: DeletionCounts, table: TableName, n: number) {
	if (n > 0) counts[table] = (counts[table] ?? 0) + n;
}

async function purgeStudent(store: DataStore, studentId: string, counts: DeletionCounts) {
	for (const table of STUDENT_OWNED) {
		add(counts, table, await sweep(store[table] as DataStore["assessment_attempts"], { studentId }));
	}
	await removeRow(store.students, studentId);
	add(counts, "students", 1);
}

export async function deleteStudent(store: DataStore, actor: Actor, studentId: string, confirmName: string) {
	const student = await requireStudent(store, actor, studentId);
	if (confirmName.trim() !== student.displayName.trim()) {
		throw new AppError("invalid", "Type the learner's name exactly to confirm.");
	}
	await audit(store, actor, "student.delete_requested", `students/${studentId}`);
	const counts: DeletionCounts = {};
	await purgeStudent(store, studentId, counts);
	await audit(store, actor, "student.delete", `students/${studentId}`, { counts });
	return counts;
}

export async function deleteFamily(store: DataStore, actor: Actor) {
	if (actor.role !== "owner") throw new AppError("forbidden", "Only the family owner can delete the family.");
	const family = await store.families.get(actor.familyId);
	if (family && family.ownerUserId !== actor.userId) {
		throw new AppError("forbidden", "Only the family owner can delete the family.");
	}
	const target = `families/${actor.familyId}`;
	const students = await store.students.listAll({ familyId: actor.familyId });
	await audit(store, actor, "family.delete_requested", target, { students: students.length });
	const counts: DeletionCounts = {};
	for (const s of students) await purgeStudent(store, s.id, counts);
	for (const table of STUDENT_OWNED) {
		add(counts, table, await sweep(store[table] as DataStore["assessment_attempts"], { familyId: actor.familyId }));
	}
	add(counts, "students", await sweep(store.students, { familyId: actor.familyId }));
	if (family) {
		await removeRow(store.families, family.id);
		add(counts, "families", 1);
	}
	add(counts, "family_members", await sweep(store.family_members, { familyId: actor.familyId }));
	await audit(store, actor, "family.delete", target, { counts });
	return counts;
}

export async function deleteAccount(
	deps: { store: DataStore; auth: Pick<AuthProvider, "deleteUser"> },
	user: AuthUser,
	confirmEmail: string,
) {
	if (confirmEmail.trim().toLowerCase() !== user.email.trim().toLowerCase()) {
		throw new AppError("invalid", "Type your account email exactly to confirm.");
	}
	const actor = await resolveActor(deps.store, user.id);
	const counts = actor ? await deleteFamily(deps.store, actor) : {};
	await deps.auth.deleteUser(user.id);
	await audit(deps.store, { userId: user.id, familyId: actor?.familyId ?? null }, "account.delete", `users/${user.id}`);
	return counts;
}
