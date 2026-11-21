import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ErrorBox, useAction } from "#/components/form";
import type { PlanetKind } from "#/components/learning-map";
import { LessonArt, SUBJECTS, SubjectTag } from "#/components/lesson-visual";
import { Nova } from "#/components/nova";
import { PlanetDot } from "#/components/planet-dot";
import { formatDate, StatusBadge } from "#/components/status";
import { useProgress } from "#/components/student-progress";
import type { StepState } from "#/learning-engine/programme";
import { getMissionFn, startSessionFn } from "#/server/functions";
import type { Course, CourseStep, CourseUnit, MissionResponse } from "#/server/services/mission";

export const Route = createFileRoute("/_authed/students/$studentId/")({
	loader: ({ params }) => getMissionFn({ data: { studentId: params.studentId } }),
	component: MissionsTab,
});

function MissionsTab() {
	const { student } = useProgress();
	const mission = Route.useLoaderData();
	const router = useRouter();
	const start = useAction(async (objectiveCode: string, kind: "lesson" | "review") => {
		try {
			const res = await startSessionFn({ data: { studentId: student.id, objectiveCode, kind } });
			await router.navigate({ to: "/learn/$sessionId", params: { sessionId: res.sessionId } });
		} catch (e) {
			await router.invalidate();
			throw e;
		}
	});

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
			<CoursePath course={mission.course} name={student.displayName} />
		</div>
	);
}

const MISSION_LABEL = {
	continue: "Mission in progress",
	review: "Review check due",
	rework: "Rework mission",
	current: "Next mission",
	complete: "Programme complete",
} as const;

const SETTLED: readonly StepState[] = ["done", "skipped"];

function unitTransition(mission: MissionResponse): { finished: CourseUnit; next: CourseUnit } | null {
	if (mission.reason !== "current") return null;
	const { units } = mission.course;
	const i = units.findIndex((u) => u.steps[0]?.code === mission.objectiveCode);
	const finished = units[i - 1];
	const next = units[i];
	if (!finished || !next) return null;
	return finished.steps.every((s) => SETTLED.includes(s.state)) ? { finished, next } : null;
}

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
	const transition = unitTransition(mission);
	return (
		<section
			aria-labelledby="mission-title"
			className="panel-space surface-space grid items-center gap-5 sm:grid-cols-[auto_1fr]"
			data-testid="mission"
			data-reason={mission.reason}
			data-objective={active?.objectiveCode}
		>
			<Nova state={active ? "ready" : "proud"} size={150} priority className="mx-auto shrink-0" />
			<div className="space-y-4">
				<div>
					<p className="meta">{MISSION_LABEL[mission.reason]}</p>
					<h2 id="mission-title" className="mt-1 font-display text-3xl">
						Today with <i className="text-accent">Nova</i>
					</h2>
				</div>
				{transition && (
					<p className="text-sm text-soft" data-testid="unit-transition">
						Unit complete: {transition.finished.title}. Next: {SUBJECTS[transition.next.subject]} ·{" "}
						{transition.next.title}.
					</p>
				)}
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

const STATE_LABEL: Record<StepState, string> = {
	done: "Done",
	current: "Current",
	locked: "Locked",
	skipped: "Skipped",
	to_rework: "To rework",
};

function stepPlanet(step: CourseStep): PlanetKind {
	if (step.state === "done") return step.status === "mastered" ? "lasting" : "secure";
	if (step.state === "current") return "active";
	if (step.state === "to_rework") return "review";
	return "unreached";
}

function unitState(unit: CourseUnit): string {
	if (unit.steps.every((s) => SETTLED.includes(s.state))) return "Complete";
	if (unit.steps.every((s) => s.state === "locked")) return "Locked";
	return "In progress";
}

function CoursePath({ course, name }: { course: Course; name: string }) {
	let n = 0;
	return (
		<section aria-labelledby="course-title" className="space-y-4" data-testid="course">
			<div>
				<p className="meta">Where {name} is now</p>
				<h2 id="course-title" className="h2">
					Course
				</h2>
				<p className="text-sm text-soft" data-testid="course-count">
					{course.done} of {course.total} steps secured
				</p>
			</div>
			<ol className="space-y-3">
				{course.units.map((unit, u) => (
					<li
						key={unit.id}
						className="card space-y-3"
						data-testid={`unit-${unit.id}`}
						aria-labelledby={`unit-title-${unit.id}`}
					>
						<div className="flex flex-wrap items-baseline justify-between gap-2">
							<div>
								<p className="meta">
									Unit {u + 1} · {SUBJECTS[unit.subject]}
								</p>
								<h3 id={`unit-title-${unit.id}`} className="font-display text-xl font-semibold">
									{unit.title}
								</h3>
							</div>
							<span className="chip">{unitState(unit)}</span>
						</div>
						<ol className="space-y-2" aria-label={`${unit.title} steps`}>
							{unit.steps.map((step) => {
								n += 1;
								return (
									<li
										key={step.code}
										className="flex items-center gap-3"
										data-testid={`step-${step.code}`}
										data-state={step.state}
										aria-current={step.state === "current" ? "step" : undefined}
									>
										<PlanetDot kind={stepPlanet(step)} className="size-5" />
										<LessonArt strand={step.strand} size={44} />
										<div className="min-w-0 flex-1">
											<p className={step.state === "locked" ? "text-soft" : "font-semibold"}>
												<span className="sr-only">{`Step ${n} of ${course.total}: `}</span>
												{step.title}
											</p>
											<div className="mt-1 flex flex-wrap items-center gap-2">
												<span className="chip" data-testid="step-state">
													{STATE_LABEL[step.state]}
												</span>
												{step.status !== "not_started" && <StatusBadge status={step.status} />}
											</div>
										</div>
									</li>
								);
							})}
						</ol>
					</li>
				))}
			</ol>
		</section>
	);
}
