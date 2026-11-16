import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
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
				<Link to="/students/$studentId" params={{ studentId: sheet.student.id }} className="link text-sm">
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
				<p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 print:hidden">
					This is the answer key. Print it separately and keep it for the adult.
				</p>
			)}

			<article className="rounded-2xl border border-slate-200 bg-white p-8 text-ink print:rounded-none print:border-0 print:p-0">
				<header className="border-b-2 border-slate-800 pb-4">
					<div className="flex items-baseline justify-between gap-4">
						<h1 className="text-xl font-bold">{isKey ? "Answer key" : "Maths practice"}</h1>
						<p className="text-xs text-slate-500">Sheet {reference}</p>
					</div>
					<p className="mt-1 text-sm">{sheet.objective.statement}</p>
					{isKey ? (
						<p className="mt-3 text-sm text-slate-600">
							For {sheet.student.displayName} · Level {sheet.difficulty}
							{sheet.autoDifficulty ? " (chosen from current progress)" : ""}
						</p>
					) : (
						<div className="mt-4 grid grid-cols-2 gap-6 text-sm">
							<p>
								Name: <span className="font-semibold">{sheet.student.displayName}</span>
							</p>
							<p>Date: ____________________</p>
						</div>
					)}
				</header>

				{isKey ? (
					<ol className="mt-6 space-y-3 text-sm">
						{sheet.items.map((item) => (
							<li key={item.number} className="break-inside-avoid border-b border-slate-100 pb-2">
								<p>
									<span className="font-semibold">{item.number}.</span> {item.prompt}
								</p>
								<p className="mt-1">
									Answer: <strong>{item.answer}</strong>
								</p>
								<p className="text-slate-600">{item.workedSolution}</p>
							</li>
						))}
					</ol>
				) : (
					<>
						<p className="mt-4 text-sm text-slate-600">
							Write each answer clearly. Show your working in the space if it helps.
						</p>
						<ol className="mt-6 grid grid-cols-1 gap-x-10 gap-y-8 sm:grid-cols-2 print:grid-cols-2">
							{sheet.items.map((item) => (
								<WorksheetItem key={item.number} item={item} />
							))}
						</ol>
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
				<span className="mr-2 font-semibold">{item.number}.</span>
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
			{wide && <p className="mt-6 pl-6">Answer: ____________________</p>}
		</li>
	);
}
