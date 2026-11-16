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

const VERSION_TONE: Record<string, string | undefined> = {
	staged: "watch",
	approved: "good",
	active: "good",
	rejected: "focus",
	failed: "focus",
};

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
				<p className="meta">Knowledge admin</p>
				<h1 className="h1 mt-2">
					Knowledge <i>sources</i>
				</h1>
				<p className="mt-3 max-w-2xl text-sm text-soft">
					Index: {data.index} · Embedder: {data.embedder}. New content is staged and only used by the tutor after
					approval.
				</p>
			</header>
			{message ? <output className="notice block">{message}</output> : null}
			<ErrorBox error={ingest.error ?? open.error ?? review.error} />

			{data.sources.map((s) => (
				<section key={s.id} className="card space-y-4">
					<div className="flex flex-wrap items-start justify-between gap-2">
						<div>
							<p className="meta">{s.publisher}</p>
							<h2 className="mt-1 font-display text-xl">{s.title}</h2>
							<p className="mt-1 text-sm text-soft">
								{s.licence} · last checked {fmt(s.lastCheckedAt)}
								{s.due ? (
									<>
										{" "}
										<span className="badge" data-tone="watch">
											check due
										</span>
									</>
								) : null}
							</p>
							<p className="mt-1 text-xs text-muted">
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

					<div className="overflow-x-auto">
						<table className="data-table">
							<thead>
								<tr>
									<th>Version</th>
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
									<tr key={v.id}>
										<td className="font-mono">v{v.version}</td>
										<td>
											<span className="badge" data-tone={VERSION_TONE[v.status]}>
												{v.status}
											</span>
										</td>
										<td>{fmt(v.fetchedAt)}</td>
										<td>{v.chunkCount}</td>
										<td>
											+{v.added} / −{v.removed}
										</td>
										<td>{v.flaggedCount}</td>
										<td>
											<button type="button" className="link" onClick={() => void open.run(v.id)}>
												Review
											</button>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>

					{s.jobs.length > 0 ? (
						<p className="text-xs text-muted">
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
	const flaggedCount = detail.resources.filter((r) => r.flags.length > 0).length;
	return (
		<section className="card space-y-4" aria-label={`Version ${detail.version}`}>
			<div className="flex flex-wrap items-center gap-3">
				<h2 className="font-display text-xl">Version {detail.version}</h2>
				<span className="badge" data-tone={VERSION_TONE[detail.status]}>
					{detail.status}
				</span>
			</div>
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
					<p className="text-xs text-muted">Flagged passages are never indexed, even after approval.</p>
				</div>
			) : null}
			<div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-line pt-3">
				<p className="meta">
					{detail.resources.length} passages · {flaggedCount} flagged
				</p>
				<p className="text-xs text-muted">Flagged passages are open; tap any other to read it.</p>
			</div>
			<ol className="divide-y divide-line">
				{detail.resources.map((r) => (
					<li key={r.id} data-testid="knowledge-passage">
						<details
							open={r.flags.length > 0}
							className={`group py-2 ${r.flags.length > 0 ? "my-2 rounded-lg border border-focus/60 bg-focus/5 px-3" : ""}`}
						>
							<summary className="flex cursor-pointer list-none items-baseline gap-2 text-sm">
								<span className="inline-block font-mono text-xs text-muted transition-transform group-open:rotate-90">›</span>
								<span className="font-semibold">{r.heading}</span>
								<span className="text-muted">({r.kind})</span>
							</summary>
							<p className="mt-1 pl-5 font-mono text-[11px] text-muted">
								Years {r.yearGroups.join(", ") || "—"} · {r.objectiveCodes.join(", ") || "no objective"} · {r.status}
								{r.flags.length > 0 ? ` · flags: ${r.flags.join(", ")}` : ""}
							</p>
							<p className="mt-2 whitespace-pre-line pl-5 text-sm text-soft">{r.text}</p>
						</details>
					</li>
				))}
			</ol>
		</section>
	);
}
