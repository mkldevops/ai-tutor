import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ErrorBox, useAction } from "#/components/form";
import { formatDate, StatusBadge } from "#/components/status";
import { askTutorFn, getSessionFn, sessionActionFn } from "#/server/functions";

export const Route = createFileRoute("/_authed/learn/$sessionId")({
	loader: ({ params }) => getSessionFn({ data: { sessionId: params.sessionId } }),
	component: LessonPage,
});

type Session = Awaited<ReturnType<typeof getSessionFn>>;

const PHASE_LABEL: Record<string, string> = {
	diagnostic: "Warm-up check",
	instruction: "Learn",
	guided: "Practise together",
	independent: "Show what you know",
	review: "Review check",
	complete: "Finished",
};

function LessonPage() {
	const initial = Route.useLoaderData();
	const [session, setSession] = useState<Session>(initial);
	const [answer, setAnswer] = useState("");
	const [tutorText, setTutorText] = useState<string | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const { view } = session;

	useEffect(() => setSession(initial), [initial]);
	useEffect(() => {
		if (view.item) inputRef.current?.focus();
	}, [view.item]);

	const act = useAction(async (data: { action: "answer"; response: string } | { action: "hint" | "continue" }) => {
		const next = await sessionActionFn({ data: { ...data, sessionId: session.sessionId } });
		setSession(next);
		if (data.action === "answer") setAnswer("");
		if (data.action === "continue") setTutorText(null);
	});

	const tutor = useAction(async () => {
		const res = await askTutorFn({ data: { sessionId: session.sessionId } });
		setTutorText(res.available ? res.text : "The AI tutor is not switched on for this family.");
	});

	const submit = (value: string) => {
		if (!value.trim() || act.pending) return;
		void act.run({ action: "answer", response: value.trim() });
	};

	return (
		<main className="page max-w-2xl space-y-6">
			<div className="flex items-center justify-between">
				<Link to="/students/$studentId" params={{ studentId: session.studentId }} className="link text-sm">
					← Back
				</Link>
				<span className="badge bg-brand-soft text-brand" data-testid="phase" data-phase={view.phase}>
					{PHASE_LABEL[view.phase]}
					{view.item ? ` · ${view.position}/${view.total}` : ""}
				</span>
			</div>

			<p className="text-sm text-slate-600">{session.objective.statement}</p>

			{session.feedback && (
				<section
					aria-live="polite"
					data-testid="feedback"
					data-correct={session.feedback.correct}
					className={`card ${session.feedback.correct ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50"}`}
				>
					<p className="font-semibold">{session.feedback.message}</p>
					{session.feedback.workedSolution && <p className="mt-2 text-sm">{session.feedback.workedSolution}</p>}
					{session.feedback.alternativeExplanation && (
						<p className="mt-2 text-sm italic">{session.feedback.alternativeExplanation}</p>
					)}
				</section>
			)}

			{view.phase === "instruction" && view.explanation && (
				<section className="card space-y-3" data-testid="explanation">
					{view.explanation.map((line) => (
						<p key={line} className="text-lg leading-relaxed">
							{line}
						</p>
					))}
					{tutorText && (
						<div className="rounded-xl bg-brand-soft p-3 text-sm" data-testid="tutor-text">
							{tutorText}
						</div>
					)}
					<div className="flex flex-wrap gap-2 pt-2">
						<button
							type="button"
							className="btn"
							disabled={act.pending}
							onClick={() => void act.run({ action: "continue" })}
						>
							I'm ready to practise
						</button>
						<button type="button" className="btn-secondary" disabled={tutor.pending} onClick={() => void tutor.run()}>
							{tutor.pending ? "Thinking…" : "Explain it another way"}
						</button>
					</div>
					<ErrorBox error={tutor.error} />
				</section>
			)}

			{view.item && (
				<section className="card space-y-4" data-testid="question">
					<p className="text-2xl font-semibold leading-snug" data-testid="prompt">
						{view.item.prompt}
					</p>
					{view.item.choices ? (
						<div className="grid grid-cols-2 gap-3">
							{view.item.choices.map((c) => (
								<button
									key={c}
									type="button"
									className="btn-secondary text-lg"
									disabled={act.pending}
									onClick={() => submit(c)}
								>
									{c}
								</button>
							))}
						</div>
					) : (
						<form
							className="flex gap-2"
							onSubmit={(e) => {
								e.preventDefault();
								submit(answer);
							}}
						>
							<input
								ref={inputRef}
								className="input text-lg"
								inputMode="decimal"
								autoComplete="off"
								aria-label="Your answer"
								value={answer}
								maxLength={64}
								onChange={(e) => setAnswer(e.target.value)}
							/>
							<button type="submit" className="btn" disabled={act.pending || !answer.trim()}>
								Check
							</button>
						</form>
					)}
					{view.canHint && (
						<button
							type="button"
							className="link text-sm"
							disabled={act.pending}
							onClick={() => void act.run({ action: "hint" })}
						>
							Show a hint
						</button>
					)}
					{session.hint && (
						<p className="rounded-xl bg-sky-50 p-3 text-sm text-sky-900" data-testid="hint">
							Hint: {session.hint}
						</p>
					)}
					{(view.phase === "independent" || view.phase === "review" || view.phase === "diagnostic") && (
						<p className="text-xs text-slate-500">No hints here. Just try your best.</p>
					)}
				</section>
			)}

			{view.phase === "complete" && session.result && (
				<section className="card space-y-3" data-testid="result">
					<h2 className="h2">Well done for finishing!</h2>
					<p>
						Status now: <StatusBadge status={session.result.status} />
					</p>
					<ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
						{session.result.reasons.map((r) => (
							<li key={r}>{r}</li>
						))}
					</ul>
					{session.result.nextReviewAt && (
						<p className="text-sm">Next review check: {formatDate(session.result.nextReviewAt)}</p>
					)}
					<Link to="/students/$studentId" params={{ studentId: session.studentId }} className="btn">
						Back to progress
					</Link>
				</section>
			)}

			<ErrorBox error={act.error} />
		</main>
	);
}
