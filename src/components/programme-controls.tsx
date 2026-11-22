import { useRouter } from "@tanstack/react-router";
import { ErrorBox, useAction } from "#/components/form";
import { formatDate } from "#/components/status";
import { PROGRAMME_SKIP_REASON_MAX } from "#/domain/types";
import {
	overrideCompetencyFn,
	setProgrammePausedFn,
	skipProgrammeStepFn,
	undoProgrammeSkipFn,
} from "#/server/functions";
import type { ProgrammeReport } from "#/server/services/programme-report";

type StepAction = "skip" | "known";

function useRefresh() {
	const router = useRouter();
	return () => router.invalidate();
}

function StepForm({
	studentId,
	objectiveCode,
	action,
}: {
	studentId: string;
	objectiveCode: string;
	action: StepAction;
}) {
	const refresh = useRefresh();
	const submit = useAction(async (form: HTMLFormElement) => {
		const reason = String(new FormData(form).get("reason"));
		if (action === "skip") {
			await skipProgrammeStepFn({ data: { studentId, objectiveCode, reason } });
		} else {
			await overrideCompetencyFn({ data: { studentId, objectiveCode, status: "secure", reason } });
		}
		form.reset();
		await refresh();
	});
	const label = action === "skip" ? "Skip this step" : "Already known";
	return (
		<form
			className="grid gap-2 sm:grid-cols-[1fr_auto]"
			data-testid={`control-${action}`}
			onSubmit={(e) => {
				e.preventDefault();
				void submit.run(e.currentTarget);
			}}
		>
			<input
				name="reason"
				className="input"
				aria-label={`${label}: reason`}
				placeholder="Reason (required)"
				minLength={3}
				maxLength={PROGRAMME_SKIP_REASON_MAX}
				required
			/>
			<button type="submit" className="btn-secondary" disabled={submit.pending}>
				{label}
			</button>
			<div className="sm:col-span-2">
				<ErrorBox error={submit.error} />
			</div>
		</form>
	);
}

function UndoSkip({ studentId, objectiveCode, title }: { studentId: string; objectiveCode: string; title: string }) {
	const refresh = useRefresh();
	const undo = useAction(async () => {
		await undoProgrammeSkipFn({ data: { studentId, objectiveCode } });
		await refresh();
	});
	return (
		<>
			<button
				type="button"
				className="link text-sm"
				aria-label={`Undo skip: ${title}`}
				disabled={undo.pending}
				onClick={() => void undo.run()}
			>
				Undo skip
			</button>
			<ErrorBox error={undo.error} />
		</>
	);
}

export function ProgrammeControls({ report: r }: { report: ProgrammeReport }) {
	const refresh = useRefresh();
	const studentId = r.student.id;
	const name = r.student.displayName;
	const step = r.position.step;
	const pause = useAction(async () => {
		await setProgrammePausedFn({ data: { studentId, paused: !r.paused } });
		await refresh();
	});
	return (
		<section
			aria-labelledby="controls-title"
			className="card space-y-4"
			data-testid="programme-controls"
			data-paused={r.paused}
		>
			<div className="flex flex-wrap items-baseline justify-between gap-2">
				<h3 id="controls-title" className="font-display text-lg font-semibold">
					Your controls
				</h3>
				<button type="button" className="btn-secondary" disabled={pause.pending} onClick={() => void pause.run()}>
					{r.paused ? "Resume the course" : "Pause the course"}
				</button>
			</div>
			<p className="text-sm text-ink-soft" data-testid="controls-status">
				{r.paused
					? `The course is paused. ${name} sees a paused mission and can still do extra practice.`
					: `Nova picks ${name}'s next mission. Pause it for a holiday or a busy week.`}
			</p>
			<ErrorBox error={pause.error} />

			{step && (
				<div className="space-y-3">
					<p className="text-sm">
						Current step: <strong>{step.title}</strong>
						{r.position.stuck ? ` · stuck after ${r.position.failedAssessments} failed checks` : ""}
					</p>
					<div className="space-y-1">
						<p className="text-sm text-ink-soft">
							Skip moves {name} on without counting the step as acquired. You can undo it later.
						</p>
						<StepForm studentId={studentId} objectiveCode={step.code} action="skip" />
					</div>
					<div className="space-y-1">
						<p className="text-sm text-ink-soft">
							Already known marks the step as secured. A later review still checks it.
						</p>
						<StepForm studentId={studentId} objectiveCode={step.code} action="known" />
					</div>
				</div>
			)}

			<div className="space-y-2" data-testid="report-skipped">
				<h4 className="font-semibold">Skipped</h4>
				{r.skipped.length === 0 ? (
					<p className="text-sm text-ink-soft">No skipped step.</p>
				) : (
					<ul className="space-y-2">
						{r.skipped.map((s) => (
							<li key={s.code} data-testid={`skipped-${s.code}`}>
								<span className="font-semibold">{s.title}</span>
								<span className="block text-sm text-ink-soft">
									Skipped {formatDate(s.at)}: {s.reason}
								</span>
								<UndoSkip studentId={studentId} objectiveCode={s.code} title={s.title} />
							</li>
						))}
					</ul>
				)}
			</div>
		</section>
	);
}
