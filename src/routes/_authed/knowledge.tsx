import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { ErrorBox, useAction } from "#/components/form";
import {
	getKnowledgeOverviewFn,
	getKnowledgeVersionFn,
	reviewKnowledgeVersionFn,
	runIngestionFn,
} from "#/server/functions";

export const Route = createFileRoute("/_authed/knowledge")({
	loader: () => getKnowledgeOverviewFn(),
	component: KnowledgePage,
});

type VersionDetail = Awaited<ReturnType<typeof getKnowledgeVersionFn>>;

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB") : "never");

function KnowledgePage() {
	const data = Route.useLoaderData();
	const router = useRouter();
	const [detail, setDetail] = useState<VersionDetail | null>(null);
	const [message, setMessage] = useState<string | null>(null);

	const ingest = useAction(async (sourceKey: string) => {
		const res = await runIngestionFn({ data: { sourceKey } });
		setMessage(res.status === "failed" ? `Check failed: ${res.error}` : `Check finished: ${res.status}`);
		await router.invalidate();
	});
	const open = useAction(async (versionId: string) => {
		setDetail(await getKnowledgeVersionFn({ data: { versionId } }));
	});
	const review = useAction(async (versionId: string, decision: "approve" | "reject", note: string) => {
		const res = await reviewKnowledgeVersionFn({ data: { versionId, decision, note } });
		setMessage(`Version ${res.status}`);
		setDetail(null);
		await router.invalidate();
	});

	return (
		<main className="page space-y-8">
			<header>
				<h1 className="h1 mb-1">Knowledge sources</h1>
				<p className="text-sm text-slate-600">
					Index: {data.index} · Embedder: {data.embedder}. New content is staged and only used by the tutor after
					approval.
				</p>
			</header>
			{message ? <p className="text-sm text-slate-700">{message}</p> : null}
			<ErrorBox error={ingest.error ?? open.error ?? review.error} />

			{data.sources.map((s) => (
				<section key={s.id} className="card space-y-4">
					<div className="flex flex-wrap items-start justify-between gap-2">
						<div>
							<h2 className="h2">{s.title}</h2>
							<p className="text-sm text-slate-600">
								{s.publisher} · {s.licence} · last checked {fmt(s.lastCheckedAt)}
								{s.due ? " · check due" : ""}
							</p>
							<p className="text-xs text-slate-500">
								Rights verified {s.rightsVerifiedAt}: {s.rightsNote}
							</p>
						</div>
						<button
							type="button"
							className="btn"
							disabled={ingest.pending || s.status !== "active"}
							onClick={() => void ingest.run(s.sourceKey)}
						>
							{ingest.pending ? "Checking…" : "Check for updates"}
						</button>
					</div>

					<table className="w-full text-left text-sm">
						<thead>
							<tr className="text-slate-500">
								<th className="py-1">Version</th>
								<th>Status</th>
								<th>Fetched</th>
								<th>Chunks</th>
								<th>Changes</th>
								<th>Flagged</th>
								<th />
							</tr>
						</thead>
						<tbody>
							{s.versions.map((v) => (
								<tr key={v.id} className="border-t border-slate-100">
									<td className="py-1">v{v.version}</td>
									<td>{v.status}</td>
									<td>{fmt(v.fetchedAt)}</td>
									<td>{v.chunkCount}</td>
									<td>
										+{v.added} / −{v.removed}
									</td>
									<td>{v.flaggedCount}</td>
									<td>
										<button type="button" className="underline" onClick={() => void open.run(v.id)}>
											Review
										</button>
									</td>
								</tr>
							))}
						</tbody>
					</table>

					{s.jobs.length > 0 ? (
						<p className="text-xs text-slate-500">
							Recent checks:{" "}
							{s.jobs
								.map((j) => `${fmt(j.createdAt)} ${j.trigger} ${j.status}${j.error ? ` (${j.error})` : ""}`)
								.join(" · ")}
						</p>
					) : null}
				</section>
			))}

			{detail ? <VersionReview detail={detail} pending={review.pending} onReview={review.run} /> : null}
		</main>
	);
}

function VersionReview({
	detail,
	pending,
	onReview,
}: {
	detail: VersionDetail;
	pending: boolean;
	onReview: (versionId: string, decision: "approve" | "reject", note: string) => Promise<unknown>;
}) {
	const [note, setNote] = useState("");
	return (
		<section className="card space-y-4" aria-label={`Version ${detail.version}`}>
			<h2 className="h2">
				v{detail.version} · {detail.status}
			</h2>
			{detail.status === "staged" ? (
				<div className="space-y-2">
					<label className="block">
						<span className="label">Review note</span>
						<input className="input" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
					</label>
					<div className="flex gap-2">
						<button
							type="button"
							className="btn"
							disabled={pending || note.trim().length < 3}
							onClick={() => void onReview(detail.id, "approve", note)}
						>
							Approve and index
						</button>
						<button
							type="button"
							className="btn-secondary"
							disabled={pending || note.trim().length < 3}
							onClick={() => void onReview(detail.id, "reject", note)}
						>
							Reject
						</button>
					</div>
					<p className="text-xs text-slate-500">Flagged passages are never indexed, even after approval.</p>
				</div>
			) : null}
			<ol className="space-y-3">
				{detail.resources.map((r) => (
					<li key={r.id} className={r.flags.length > 0 ? "rounded border border-red-300 p-2" : "border-t pt-2"}>
						<p className="text-sm font-semibold">
							{r.heading} <span className="font-normal text-slate-500">({r.kind})</span>
						</p>
						<p className="text-xs text-slate-500">
							Years {r.yearGroups.join(", ") || "—"} · {r.objectiveCodes.join(", ") || "no objective"} · {r.status}
							{r.flags.length > 0 ? ` · flags: ${r.flags.join(", ")}` : ""}
						</p>
						<p className="whitespace-pre-line text-sm">{r.text}</p>
					</li>
				))}
			</ol>
		</section>
	);
}
