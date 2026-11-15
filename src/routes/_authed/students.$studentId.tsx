import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { ErrorBox, useAction } from "#/components/form";
import { formatDate, StatusBadge } from "#/components/status";
import type { CompetencyStatus } from "#/domain/types";
import {
	deleteStudentFn,
	exportStudentFn,
	getProgressFn,
	overrideCompetencyFn,
	startSessionFn,
} from "#/server/functions";

export const Route = createFileRoute("/_authed/students/$studentId")({
	loader: ({ params }) => getProgressFn({ data: { studentId: params.studentId } }),
	component: StudentPage,
});

const STATUSES: CompetencyStatus[] = ["emerging", "developing", "secure", "mastered", "needs_review"];

function StudentPage() {
	const progress = Route.useLoaderData();
	const router = useRouter();
	const { student } = progress;

	const start = useAction(async (objectiveCode: string, kind: "lesson" | "review") => {
		const res = await startSessionFn({ data: { studentId: student.id, objectiveCode, kind } });
		await router.navigate({ to: "/learn/$sessionId", params: { sessionId: res.sessionId } });
	});

	const exportData = useAction(async () => {
		const json = await exportStudentFn({ data: { studentId: student.id } });
		const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
		const a = document.createElement("a");
		a.href = url;
		a.download = `learner-${student.id}.json`;
		a.click();
		URL.revokeObjectURL(url);
	});

	const remove = useAction(async () => {
		await deleteStudentFn({ data: { studentId: student.id, confirm: true } });
		await router.navigate({ to: "/dashboard" });
	});
	const [confirmName, setConfirmName] = useState("");

	return (
		<main className="page space-y-6">
			<div>
				<Link to="/dashboard" className="link text-sm">
					← All learners
				</Link>
				<h1 className="h1 mt-2" data-testid="student-name">
					{student.displayName} <span className="text-slate-500">· Year {student.yearGroup}</span>
				</h1>
			</div>

			<ErrorBox error={start.error} />

			{progress.objectives.map((o) => (
				<section key={o.code} className="card space-y-4" data-testid={`objective-${o.code}`}>
					<div className="flex flex-wrap items-start justify-between gap-3">
						<div className="max-w-xl">
							<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
								Maths · {o.strand} · {o.code}
							</p>
							<p className="mt-1 font-medium">{o.statement}</p>
						</div>
						<StatusBadge status={o.status} />
					</div>

					<div className="flex flex-wrap gap-2">
						{o.openSessionId ? (
							<Link to="/learn/$sessionId" params={{ sessionId: o.openSessionId }} className="btn">
								Continue lesson
							</Link>
						) : (
							<button
								type="button"
								className="btn"
								disabled={start.pending}
								onClick={() => void start.run(o.code, "lesson")}
							>
								{o.status === "not_started" ? "Start lesson" : "Practise again"}
							</button>
						)}
						{o.review && (
							<button
								type="button"
								className="btn-secondary"
								disabled={start.pending || !o.review.isDue || !!o.openSessionId}
								onClick={() => void start.run(o.code, "review")}
							>
								{o.review.isDue ? "Start review check" : `Review due ${formatDate(o.review.dueAt)}`}
							</button>
						)}
					</div>

					<details className="text-sm">
						<summary className="cursor-pointer font-medium text-slate-700">Evidence and reasons</summary>
						<table className="mt-3 w-full text-left">
							<thead className="text-slate-500">
								<tr>
									<th className="py-1">Mode</th>
									<th>Correct / items</th>
								</tr>
							</thead>
							<tbody>
								{(["diagnostic", "guided", "independent", "review"] as const).map((m) => (
									<tr key={m} className="border-t border-slate-100">
										<td className="py-1 capitalize">{m}</td>
										<td>
											{o.evidence[m].correct} / {o.evidence[m].items}
										</td>
									</tr>
								))}
							</tbody>
						</table>
						{o.reasons.length > 0 && (
							<ul className="mt-3 list-disc space-y-1 pl-5 text-slate-700">
								{o.reasons.map((r) => (
									<li key={r}>{r}</li>
								))}
							</ul>
						)}
						{o.override && (
							<p className="mt-3 rounded-lg bg-amber-50 p-2 text-amber-900">
								Parent override: {o.override.status} — “{o.override.reason}” (computed: {o.computedStatus})
							</p>
						)}
						<p className="mt-3 text-xs text-slate-500">
							Source: {o.source.publisher}, {o.source.title} ({o.source.reference}).{" "}
							<a className="link" href={o.source.url} target="_blank" rel="noreferrer">
								View source
							</a>{" "}
							· {o.source.licence}
						</p>
						<OverrideForm studentId={student.id} objectiveCode={o.code} hasOverride={!!o.override} />
					</details>
				</section>
			))}

			{progress.events.length > 0 && (
				<section className="card">
					<h2 className="h2 mb-3">Recent changes</h2>
					<ul className="space-y-1 text-sm">
						{progress.events.map((e) => (
							<li key={e.id}>
								{formatDate(e.createdAt)} · {e.objectiveCode}: {e.fromStatus} → <strong>{e.toStatus}</strong>
								{e.reason ? ` (${e.reason})` : ""}
							</li>
						))}
					</ul>
				</section>
			)}

			<section className="card space-y-4">
				<h2 className="h2">Data</h2>
				<div className="flex flex-wrap gap-2">
					<button type="button" className="btn-secondary" onClick={() => void exportData.run()}>
						Export data (JSON)
					</button>
				</div>
				<ErrorBox error={exportData.error} />
				<div className="space-y-2 border-t border-slate-100 pt-4">
					<p className="text-sm text-slate-700">
						Delete this learner and all their sessions, answers and progress. Type{" "}
						<strong>{student.displayName}</strong> to confirm.
					</p>
					<div className="flex flex-wrap gap-2">
						<input
							className="input max-w-xs"
							aria-label="Confirm learner name"
							value={confirmName}
							onChange={(e) => setConfirmName(e.target.value)}
						/>
						<button
							type="button"
							className="btn-danger"
							disabled={confirmName !== student.displayName || remove.pending}
							onClick={() => void remove.run()}
						>
							Delete learner
						</button>
					</div>
					<ErrorBox error={remove.error} />
				</div>
			</section>
		</main>
	);
}

function OverrideForm({
	studentId,
	objectiveCode,
	hasOverride,
}: {
	studentId: string;
	objectiveCode: string;
	hasOverride: boolean;
}) {
	const router = useRouter();
	const action = useAction(async (form: HTMLFormElement) => {
		const data = new FormData(form);
		const raw = String(data.get("status"));
		await overrideCompetencyFn({
			data: {
				studentId,
				objectiveCode,
				status: raw === "clear" ? null : (raw as CompetencyStatus),
				reason: String(data.get("reason")),
			},
		});
		form.reset();
		await router.invalidate();
	});
	return (
		<form
			className="mt-4 grid gap-2 border-t border-slate-100 pt-4 sm:grid-cols-[auto_1fr_auto]"
			onSubmit={(e) => {
				e.preventDefault();
				void action.run(e.currentTarget);
			}}
		>
			<select name="status" className="input" aria-label="Override status" defaultValue="secure">
				{STATUSES.map((s) => (
					<option key={s} value={s}>
						{s}
					</option>
				))}
				{hasOverride && <option value="clear">clear override</option>}
			</select>
			<input name="reason" className="input" placeholder="Reason (required)" minLength={3} required />
			<button type="submit" className="btn-secondary" disabled={action.pending}>
				Override
			</button>
			<div className="sm:col-span-3">
				<ErrorBox error={action.error} />
			</div>
		</form>
	);
}
