import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { ErrorBox, useAction } from "#/components/form";
import { Orbi } from "#/components/orbi";
import { OrbitMap } from "#/components/orbit-map";
import { PrintableWorksheets } from "#/components/printable-worksheets";
import { formatDate, StatusBadge } from "#/components/status";
import { WorksheetChecks } from "#/components/worksheet-checks";
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
const DONE: CompetencyStatus[] = ["secure", "mastered"];

type Objective = Awaited<ReturnType<typeof getProgressFn>>["objectives"][number];
type Mission = { objective: Objective; kind: "continue" | "review" | "lesson" };

function nextMission(objectives: Objective[]): Mission | null {
	const open = objectives.find((o) => o.openSessionId);
	if (open) return { objective: open, kind: "continue" };
	const due = objectives.find((o) => o.review?.isDue);
	if (due) return { objective: due, kind: "review" };
	const todo = objectives.find((o) => !DONE.includes(o.status));
	return todo ? { objective: todo, kind: "lesson" } : null;
}

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
	const mission = nextMission(progress.objectives);
	const objectives = progress.objectives;
	const stats = [
		{ label: "Objectives", value: objectives.length },
		{ label: "Secure or better", value: objectives.filter((o) => DONE.includes(o.status)).length },
		{
			label: "In progress",
			value: objectives.filter((o) => !DONE.includes(o.status) && o.status !== "not_started").length,
		},
		{ label: "Reviews due", value: objectives.filter((o) => o.review?.isDue).length },
	];

	return (
		<main className="page space-y-6">
			<header>
				<Link to="/dashboard" className="link text-sm">
					← All learners
				</Link>
				<h1 className="h1 mt-3" data-testid="student-name">
					{student.displayName} <i className="text-ink-mute">· Year {student.yearGroup}</i>
				</h1>
			</header>

			<section className="panel-space surface-space grid items-center gap-5 sm:grid-cols-[auto_1fr]">
				<Orbi state={mission ? "ready" : "proud"} size={150} className="mx-auto shrink-0" />
				<div className="space-y-4">
					<p className="meta">
						{mission ? (mission.kind === "review" ? "Review check due" : "Next mission") : "All missions secure"}
					</p>
					<p className="bubble text-lg">
						{mission
							? mission.objective.statement
							: `${student.displayName} has secured every objective here. Orbi will call them back for review checks.`}
					</p>
					{mission &&
						(mission.kind === "continue" && mission.objective.openSessionId ? (
							<Link to="/learn/$sessionId" params={{ sessionId: mission.objective.openSessionId }} className="btn">
								Resume mission
							</Link>
						) : (
							<button
								type="button"
								className="btn"
								disabled={start.pending}
								onClick={() => void start.run(mission.objective.code, mission.kind === "review" ? "review" : "lesson")}
							>
								Launch mission
							</button>
						))}
				</div>
			</section>

			<ErrorBox error={start.error} />

			<section aria-label="Progress summary" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
				{stats.map((s) => (
					<div key={s.label} className="stat">
						<p className="text-sm text-ink-mute">{s.label}</p>
						<p className="stat-value">{s.value}</p>
					</div>
				))}
			</section>

			{objectives.length > 0 && (
				<section aria-labelledby="orbit-title" className="panel-space surface-space space-y-4">
					<div>
						<p className="meta">Skill orbit</p>
						<h2 id="orbit-title" className="mt-1 font-display text-3xl">
							Where {student.displayName} <i className="text-accent">is now</i>
						</h2>
					</div>
					<OrbitMap
						core={`Year ${student.yearGroup}`}
						skills={objectives.map((o) => ({
							code: o.code,
							statement: o.statement,
							status: o.status,
							reviewDue: o.review?.isDue,
						}))}
					/>
				</section>
			)}

			<h2 className="h2">Objectives</h2>

			{progress.objectives.map((o) => (
				<section key={o.code} className="card space-y-4" data-testid={`objective-${o.code}`}>
					<div className="flex flex-wrap items-start justify-between gap-3">
						<div className="max-w-xl">
							<p className="meta">
								Maths · {o.strand} · {o.code}
							</p>
							<p className="mt-2 font-display text-xl leading-snug">{o.statement}</p>
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
						<summary className="cursor-pointer font-medium text-ink-soft">Evidence and reasons</summary>
						<table className="mt-3 w-full text-left">
							<thead className="text-ink-mute">
								<tr>
									<th className="py-1">Mode</th>
									<th>Correct / items</th>
								</tr>
							</thead>
							<tbody>
								{(["diagnostic", "guided", "independent", "review"] as const).map((m) => (
									<tr key={m} className="border-t border-line">
										<td className="py-1 capitalize">{m}</td>
										<td>
											{o.evidence[m].correct} / {o.evidence[m].items}
										</td>
									</tr>
								))}
							</tbody>
						</table>
						{o.reasons.length > 0 && (
							<ul className="mt-3 list-disc space-y-1 pl-5 text-ink-soft">
								{o.reasons.map((r) => (
									<li key={r}>{r}</li>
								))}
							</ul>
						)}
						{o.override && (
							<p className="note-hint mt-3">
								Parent override: {o.override.status} — “{o.override.reason}” (computed: {o.computedStatus})
							</p>
						)}
						<p className="mt-3 text-xs text-ink-mute">
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

			<PrintableWorksheets studentId={student.id} objectives={progress.printables} />

			<WorksheetChecks
				studentId={student.id}
				objectives={progress.objectives.map((o) => ({ code: o.code, statement: o.statement }))}
			/>

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
				<div className="space-y-2 border-t border-line pt-4">
					<p className="text-sm text-ink-soft">
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
			className="mt-4 grid gap-2 border-t border-line pt-4 sm:grid-cols-[auto_1fr_auto]"
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
