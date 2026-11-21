import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { ErrorBox, useAction } from "#/components/form";
import { LessonArt, SubjectTag } from "#/components/lesson-visual";
import { Nova } from "#/components/nova";
import { OrbitMap } from "#/components/orbit-map";
import { formatDate, StatusBadge } from "#/components/status";
import { DONE, type Progress, useProgress } from "#/components/student-progress";
import { SubjectSwitch, subjectsIn } from "#/components/subject-switch";
import type { Subject } from "#/domain/types";
import { getMissionFn, startSessionFn } from "#/server/functions";
import type { MissionResponse } from "#/server/services/mission";

export const Route = createFileRoute("/_authed/students/$studentId/")({
	loader: ({ params }) => getMissionFn({ data: { studentId: params.studentId } }),
	component: MissionsTab,
});

function MissionsTab() {
	const progress = useProgress();
	const { student } = progress;
	const subjects = subjectsIn(progress.objectives);
	const [chosen, setSubject] = useState<Subject | null>(null);
	const subject = chosen ?? lastSubject(progress) ?? subjects[0] ?? "maths";
	const objectives = progress.objectives.filter((o) => o.subject === subject);
	const counts = Object.fromEntries(
		subjects.map((s) => {
			const all = progress.objectives.filter((o) => o.subject === s);
			return [s, `${all.filter((o) => DONE.includes(o.status)).length}/${all.length}`];
		}),
	);
	const router = useRouter();
	const start = useAction(async (objectiveCode: string, kind: "lesson" | "review") => {
		const res = await startSessionFn({ data: { studentId: student.id, objectiveCode, kind } });
		await router.navigate({ to: "/learn/$sessionId", params: { sessionId: res.sessionId } });
	});
	const mission = Route.useLoaderData();

	return (
		<div className="space-y-6">
			<MissionHero
				mission={mission}
				name={student.displayName}
				yearGroup={student.yearGroup}
				pending={start.pending}
				onStart={(code, kind) => void start.run(code, kind)}
			/>
			<ErrorBox error={start.error} />
			<SubjectSwitch subjects={subjects} value={subject} onChange={setSubject} counts={counts} />
			<div id="subject-panel" role="tabpanel" aria-labelledby={`subject-tab-${subject}`} className="space-y-6">
				<section aria-labelledby="objectives-title" className="space-y-3">
					<h2 id="objectives-title" className="h2">
						{subject === "english" ? "English" : "Maths"} objectives
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
		</div>
	);
}

function lastSubject({ objectives, recentSessions }: Progress): Subject | undefined {
	const open = objectives.find((o) => o.openSessionId);
	if (open) return open.subject;
	const last = recentSessions[0]?.objectiveCode;
	return objectives.find((o) => o.code === last)?.subject;
}

const MISSION_LABEL = {
	continue: "Mission in progress",
	review: "Review check due",
	rework: "Rework mission",
	current: "Next mission",
	complete: "Programme complete",
} as const;

function MissionHero({
	mission,
	name,
	yearGroup,
	pending,
	onStart,
}: {
	mission: MissionResponse;
	name: string;
	yearGroup: number;
	pending: boolean;
	onStart: (objectiveCode: string, kind: "lesson" | "review") => void;
}) {
	const active = mission.reason !== "complete" && mission.objective ? mission : null;
	return (
		<section
			className="panel-space surface-space grid items-center gap-5 sm:grid-cols-[auto_1fr]"
			data-testid="mission"
			data-reason={mission.reason}
		>
			<Nova state={active ? "ready" : "proud"} size={150} priority className="mx-auto shrink-0" />
			<div className="space-y-4">
				<p className="meta">{MISSION_LABEL[mission.reason]}</p>
				{active?.objective ? (
					<div className="bubble flex items-center gap-4">
						<LessonArt strand={active.objective.strand} size={72} />
						<div className="min-w-0 space-y-1.5">
							<SubjectTag subject={active.objective.subject} strand={active.objective.strand} />
							<p className="font-display text-xl leading-snug font-semibold">{active.objective.title}</p>
						</div>
					</div>
				) : (
					<p className="bubble text-lg">
						{`${name} has secured every step of the Year ${yearGroup} programme. `}
						{mission.reason === "complete" && mission.nextReviewAt
							? `Next review check ${formatDate(mission.nextReviewAt)}.`
							: "Nova will call them back for review checks."}
					</p>
				)}
				{active &&
					(active.sessionId ? (
						<Link to="/learn/$sessionId" params={{ sessionId: active.sessionId }} className="btn">
							Resume mission
						</Link>
					) : (
						<button
							type="button"
							className="btn"
							disabled={pending}
							onClick={() => onStart(active.objectiveCode, active.sessionKind)}
						>
							Launch mission
						</button>
					))}
			</div>
		</section>
	);
}
