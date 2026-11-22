import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { z } from "zod";
import { Nova, type NovaState } from "#/components/nova";
import { requireParentArea } from "#/components/parent-gate";
import { getPrintableSheetFn } from "#/server/functions";
import { LETTERS, type PrintableItem } from "#/worksheets/printable";

const searchSchema = z.object({
	objective: z.string().catch(""),
	seed: z.string().catch(""),
	count: z.coerce.number().int().min(4).max(20).catch(10),
	difficulty: z.enum(["auto", "1", "2", "3"]).catch("auto"),
	variant: z.enum(["worksheet", "answer_key"]).catch("worksheet"),
});

export const Route = createFileRoute("/_authed/print/$studentId")({
	beforeLoad: requireParentArea,
	validateSearch: searchSchema,
	loaderDeps: ({ search }) => search,
	loader: ({ params, deps }) =>
		getPrintableSheetFn({
			data: {
				studentId: params.studentId,
				objectiveCode: deps.objective,
				seed: deps.seed,
				count: deps.count,
				difficulty: deps.difficulty === "auto" ? null : (Number(deps.difficulty) as 1 | 2 | 3),
				variant: deps.variant,
			},
		}),
	head: () => ({ meta: [{ title: "Printable worksheet · AI Tutor" }] }),
	component: PrintPage,
});

function PrintPage() {
	const sheet = Route.useLoaderData();
	const search = Route.useSearch();
	const isKey = sheet.variant === "answer_key";
	const reference = `${sheet.objective.code} · ${sheet.seed.slice(0, 8)}`;

	return (
		<main className="mx-auto w-full max-w-3xl px-4 py-6 print:max-w-none print:p-0">
			<div className="mb-6 flex flex-wrap items-center gap-2 print:hidden">
				<Link to="/students/$studentId/worksheets" params={{ studentId: sheet.student.id }} className="link text-sm">
					← {sheet.student.displayName}
				</Link>
				<span className="flex-1" />
				<button type="button" className="btn" onClick={() => window.print()}>
					Print or save as PDF
				</button>
				<Link
					to="/print/$studentId"
					params={{ studentId: sheet.student.id }}
					search={{ ...search, variant: isKey ? "worksheet" : "answer_key" }}
					className="btn-secondary"
				>
					{isKey ? "Show worksheet" : "Show answer key"}
				</Link>
				<Link
					to="/print/$studentId"
					params={{ studentId: sheet.student.id }}
					search={{ ...search, variant: "worksheet", seed: crypto.randomUUID() }}
					className="btn-secondary"
				>
					New questions
				</Link>
			</div>
			{isKey && (
				<p className="notice mb-4 print:hidden">
					This is the answer key. Print it separately and keep it for the adult.
				</p>
			)}

			<article className="rounded-[10px] border border-line bg-white p-8 text-ink shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none">
				<header className="relative overflow-hidden border-b-2 border-ink pb-4">
					<OrbitLines />
					<div className="relative flex items-baseline justify-between gap-4">
						<p className="font-mono text-[11px] tracking-wide text-ink-mute uppercase">
							AI Tutor · Year {sheet.student.yearGroup} · {isKey ? "For the adult" : "Paper mission"}
						</p>
						<p className="font-mono text-[11px] text-ink-mute">Sheet {reference}</p>
					</div>
					<h1 className="relative mt-2 font-display text-3xl font-bold tracking-tight">
						{isKey ? (
							<>
								Answer <i className="text-link not-italic">key</i>
							</>
						) : (
							<>
								Maths <i className="text-link not-italic">practice</i>
							</>
						)}
					</h1>
					<p className="relative mt-2 max-w-md text-sm text-ink-soft">{sheet.objective.statement}</p>
					{isKey ? (
						<p className="relative mt-3 text-sm text-ink-mute">
							For {sheet.student.displayName} · Level {sheet.difficulty}
							{sheet.autoDifficulty ? " (chosen from current progress)" : ""}
						</p>
					) : (
						<div className="relative mt-4 grid grid-cols-2 gap-6 text-sm">
							<p>
								Name: <span className="font-semibold">{sheet.student.displayName}</span>
							</p>
							<p>Date: ____________________</p>
						</div>
					)}
				</header>

				{isKey ? (
					<>
						<NovaSays state="thinking">
							Use the worked solution to talk through the method together. A wrong answer with good working is a great
							place to start.
						</NovaSays>
						<ol className="mt-6 space-y-3 text-sm">
							{sheet.items.map((item) => (
								<li key={item.number} className="break-inside-avoid border-b border-line pb-3">
									<p>
										<QuestionNumber n={item.number} small /> {item.prompt}
									</p>
									<p className="mt-1">
										Answer: <strong>{item.answer}</strong>
									</p>
									<p className="text-ink-mute">{item.workedSolution}</p>
								</li>
							))}
						</ol>
					</>
				) : (
					<>
						<NovaSays state="hint">
							<ul className="grid gap-1 sm:grid-cols-3 print:grid-cols-3">
								<Step n={1}>Read the question twice.</Step>
								<Step n={2}>Show how you worked it out in the Working box.</Step>
								<Step n={3}>Write your final answer in the Answer box, or colour one circle.</Step>
							</ul>
						</NovaSays>
						<ol className="mt-6 grid grid-cols-1 gap-x-10 gap-y-8 sm:grid-cols-2 print:grid-cols-2">
							{sheet.items.map((item) => (
								<WorksheetItem key={item.number} item={item} />
							))}
						</ol>
						<SelfCheck />
					</>
				)}
			</article>
		</main>
	);
}

function WorksheetItem({ item }: { item: PrintableItem }) {
	const wide = item.type === "word_problem";
	return (
		<li className={`break-inside-avoid text-lg ${wide ? "sm:col-span-2 print:col-span-2" : ""}`}>
			<p>
				<QuestionNumber n={item.number} />
				<span className={wide ? "" : "font-mono"}>{item.prompt}</span>
			</p>
			{item.choices && (
				<ul className="mt-2 flex flex-wrap gap-x-6 gap-y-1 pl-6 text-base">
					{item.choices.map((c, i) => (
						<li key={c}>
							◯ {LETTERS[i]}) {c}
						</li>
					))}
				</ul>
			)}
			<div className="mt-3 space-y-2 pl-6">
				<WorkBox label="Working" className={wide ? "h-48" : "h-36"} />
				{!item.choices && <WorkBox label="Answer" className="h-16 border-2 border-ink" />}
			</div>
		</li>
	);
}

function WorkBox({ label, className }: { label: string; className: string }) {
	return (
		<div
			data-testid={`box-${label.toLowerCase()}`}
			className={`squared-paper relative rounded-md border border-ink-mute ${className}`}
		>
			<span className="absolute top-1 left-2 bg-white px-1 font-mono text-[10px] tracking-wide text-ink-mute uppercase">
				{label}
			</span>
		</div>
	);
}

function QuestionNumber({ n, small }: { n: number; small?: boolean }) {
	return (
		<span
			className={`mr-2 inline-flex items-center justify-center rounded-md border-2 border-ink font-display font-bold tabular-nums ${small ? "h-6 min-w-6 text-xs" : "h-8 min-w-8 align-[2px] text-base"}`}
		>
			{n}
		</span>
	);
}

function NovaSays({ state, children }: { state: NovaState; children: ReactNode }) {
	return (
		<div className="mt-5 flex items-center gap-3 break-inside-avoid">
			<Nova state={state} size={104} animated={false} priority className="shrink-0" />
			<div className="flex-1 rounded-[2px_10px_10px_10px] border border-line bg-brand-soft px-4 py-3 text-sm text-ink-soft print:border-ink-mute">
				<p className="mb-1 font-mono text-[10px] tracking-wide text-ink-mute uppercase">Nova says</p>
				{children}
			</div>
		</div>
	);
}

function Step({ n, children }: { n: number; children: ReactNode }) {
	return (
		<li className="flex gap-2">
			<span className="font-display font-bold text-link">{n}</span>
			<span>{children}</span>
		</li>
	);
}

function SelfCheck() {
	return (
		<section
			data-testid="self-check"
			className="mt-10 flex items-start gap-4 break-inside-avoid rounded-[10px] border border-ink-mute p-4 text-sm"
		>
			<div className="grid flex-1 gap-4 sm:grid-cols-2 print:grid-cols-2">
				<div>
					<p className="font-mono text-[10px] tracking-wide text-ink-mute uppercase">Before you hand it in</p>
					<ul className="mt-2 space-y-1">
						<li>◻ I showed my working for every question.</li>
						<li>◻ I checked each answer is sensible.</li>
					</ul>
				</div>
				<div>
					<p className="font-mono text-[10px] tracking-wide text-ink-mute uppercase">How did it feel?</p>
					<ul className="mt-2 space-y-1">
						<li>◯ I can do this on my own.</li>
						<li>◯ I am getting there.</li>
						<li>◯ I would like some help.</li>
					</ul>
				</div>
			</div>
			<Nova state="proud" size={88} animated={false} priority className="shrink-0" />
		</section>
	);
}

function OrbitLines() {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 240 120"
			className="pointer-events-none absolute top-4 -right-16 h-28 w-64 text-ink"
			fill="none"
		>
			<ellipse cx="150" cy="60" rx="80" ry="30" stroke="currentColor" strokeOpacity="0.1" />
			<ellipse cx="150" cy="60" rx="50" ry="18" stroke="currentColor" strokeOpacity="0.08" />
			<circle cx="74" cy="66" r="3" fill="currentColor" fillOpacity="0.35" />
			<circle cx="196" cy="48" r="2" fill="currentColor" fillOpacity="0.25" />
		</svg>
	);
}
