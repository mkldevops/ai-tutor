import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ErrorBox, useAction } from "#/components/form";
import { LessonArt, SubjectTag } from "#/components/lesson-visual";
import { Nova } from "#/components/nova";
import { OrbitMap } from "#/components/orbit-map";
import { formatDate, StatusBadge } from "#/components/status";
import { DONE, type Objective, useProgress } from "#/components/student-progress";
import { startSessionFn } from "#/server/functions";

export const Route = createFileRoute("/_authed/students/$studentId/")({
	component: MissionsTab,
});

type Mission = { objective: Objective; kind: "continue" | "review" | "lesson" };

function nextMission(objectives: Objective[]): Mission | null {
	const open = objectives.find((o) => o.openSessionId);
	if (open) return { objective: open, kind: "continue" };
	const due = objectives.find((o) => o.review?.isDue);
	if (due) return { objective: due, kind: "review" };
	const todo = objectives.find((o) => !DONE.includes(o.status));
	return todo ? { objective: todo, kind: "lesson" } : null;
}

function MissionsTab() {
	const { student, objectives } = useProgress();
	const router = useRouter();
	const start = useAction(async (objectiveCode: string, kind: "lesson" | "review") => {
		const res = await startSessionFn({ data: { studentId: student.id, objectiveCode, kind } });
		await router.navigate({ to: "/learn/$sessionId", params: { sessionId: res.sessionId } });
	});
	const mission = nextMission(objectives);

	return (
		<div className="space-y-6">
			<section className="panel-space surface-space grid items-center gap-5 sm:grid-cols-[auto_1fr]">
				<Nova state={mission ? "ready" : "proud"} size={150} priority className="mx-auto shrink-0" />
				<div className="space-y-4">
					<p className="meta">
						{mission ? (mission.kind === "review" ? "Review check due" : "Next mission") : "All missions secure"}
					</p>
					{mission ? (
						<div className="bubble flex items-center gap-4">
							<LessonArt strand={mission.objective.strand} size={72} />
							<div className="min-w-0 space-y-1.5">
								<SubjectTag subject={mission.objective.subject} strand={mission.objective.strand} />
								<p className="font-display text-xl leading-snug font-semibold">{mission.objective.title}</p>
							</div>
						</div>
					) : (
						<p className="bubble text-lg">
							{`${student.displayName} has secured every objective here. Nova will call them back for review checks.`}
						</p>
					)}
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

			<section aria-labelledby="objectives-title" className="space-y-3">
				<h2 id="objectives-title" className="h2">
					All objectives
				</h2>
				<ul className="grid gap-3">
					{objectives.map((o) => (
						<li
							key={o.code}
							className="card grid grid-cols-[auto_1fr] gap-4 sm:grid-cols-[auto_1fr_auto] sm:items-center"
							data-testid={`objective-${o.code}`}
						>
							<LessonArt strand={o.strand} />
							<div className="min-w-0 space-y-1.5">
								<div className="flex flex-wrap items-center gap-2">
									<SubjectTag subject={o.subject} strand={o.strand} />
									<StatusBadge status={o.status} />
								</div>
								<p className="font-display text-xl leading-snug font-semibold">{o.title}</p>
								<p className="text-soft text-sm leading-snug">{o.statement}</p>
							</div>
							<div className="col-span-2 flex flex-wrap gap-2 sm:col-span-1 sm:flex-col sm:items-stretch">
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
						</li>
					))}
				</ul>
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
		</div>
	);
}
