import { AppError, notFound } from "#/server/services/errors";
import { audit } from "#/server/services/family";
import type {
	DataStore,
	IngestionJobRecord,
	KnowledgeSourceRecord,
	KnowledgeVersionRecord,
} from "#/server/store/types";
import type { Embedder } from "./embedding";
import type { JsonFetcher } from "./fetcher";
import { diffChunks, parseGovukContent } from "./pipeline";
import { getSourceDefinition, licenceClearance, SOURCES } from "./sources";
import type { VectorIndex } from "./vector-index";

export type KnowledgeDeps = {
	store: DataStore;
	index: VectorIndex;
	embedder: Embedder;
	fetchJson: JsonFetcher;
	now?: () => Date;
};

const DAY_MS = 24 * 60 * 60_000;
const nowIso = (deps: { now?: () => Date }) => (deps.now?.() ?? new Date()).toISOString();

async function inBatches<T>(items: T[], size: number, fn: (item: T) => Promise<unknown>) {
	for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(fn));
}

export async function syncSources(store: DataStore): Promise<KnowledgeSourceRecord[]> {
	const out: KnowledgeSourceRecord[] = [];
	for (const def of SOURCES) {
		const meta = {
			publisher: def.publisher,
			title: def.title,
			pageUrl: def.pageUrl,
			licence: def.licence,
			redistribution: def.redistribution,
			checkIntervalDays: def.checkIntervalDays,
		};
		const [existing] = await store.knowledge_sources.list({ sourceKey: def.sourceKey }, { limit: 1 });
		out.push(
			existing
				? await store.knowledge_sources.update(existing.id, meta)
				: await store.knowledge_sources.create({
						sourceKey: def.sourceKey,
						...meta,
						status: "active",
						lastCheckedAt: null,
						lastChangedAt: null,
					}),
		);
	}
	return out;
}

export function isDue(source: KnowledgeSourceRecord, now: Date): boolean {
	if (source.status !== "active") return false;
	if (!source.lastCheckedAt) return true;
	return new Date(source.lastCheckedAt).getTime() + source.checkIntervalDays * DAY_MS <= now.getTime();
}

async function markVersion(
	store: DataStore,
	version: KnowledgeVersionRecord,
	status: KnowledgeVersionRecord["status"],
) {
	const resources = await store.learning_resources.list({ versionId: version.id }, { limit: 2000 });
	await inBatches(resources, 10, (r) => store.learning_resources.update(r.id, { status }));
	return store.knowledge_versions.update(version.id, { status });
}

export async function runIngestion(
	deps: KnowledgeDeps,
	sourceKey: string,
	opts: { trigger: "manual" | "scheduled"; actorUserId: string | null },
): Promise<IngestionJobRecord> {
	const { store } = deps;
	const def = getSourceDefinition(sourceKey);
	if (!def) throw notFound("Source");
	const source = (await syncSources(store)).find((s) => s.sourceKey === sourceKey);
	if (!source) throw notFound("Source");
	if (source.status !== "active") throw new AppError("invalid", "This source is disabled.");

	const job = await store.ingestion_jobs.create({
		sourceId: source.id,
		trigger: opts.trigger,
		status: "running",
		actorUserId: opts.actorUserId,
		versionId: null,
		finishedAt: null,
		error: null,
		stats: {},
	});

	try {
		const clearance = licenceClearance(def);
		if (!clearance.ok) throw new Error(clearance.reason);
		const raw = await deps.fetchJson(def.fetchUrl);
		const doc = parseGovukContent(raw, def.subject, def.excludeSections);
		const fetchedAt = nowIso(deps);
		await store.knowledge_sources.update(source.id, { lastCheckedAt: fetchedAt });

		const versions = await store.knowledge_versions.list({ sourceId: source.id }, { limit: 500 });
		const current = versions.find((v) => v.checksum === doc.checksum && ["staged", "approved"].includes(v.status));
		const flagged = doc.chunks.filter((c) => c.flags.length > 0).length;
		const stats = { chunks: doc.chunks.length, flagged };
		if (current) {
			return store.ingestion_jobs.update(job.id, {
				status: "unchanged",
				versionId: current.id,
				finishedAt: nowIso(deps),
				stats,
			});
		}

		const approved = versions.find((v) => v.status === "approved");
		const previous = approved
			? (await store.learning_resources.list({ versionId: approved.id }, { limit: 2000 })).map((r) => r.checksum)
			: [];
		const diff = diffChunks(
			previous,
			doc.chunks.map((c) => c.checksum),
		);
		for (const stale of versions.filter((v) => v.status === "staged")) await markVersion(store, stale, "superseded");

		const version = await store.knowledge_versions.create({
			sourceId: source.id,
			version: Math.max(0, ...versions.map((v) => v.version)) + 1,
			checksum: doc.checksum,
			title: doc.title.slice(0, 300),
			upstreamUpdatedAt: doc.upstreamUpdatedAt,
			fetchedAt,
			status: "staged",
			chunkCount: doc.chunks.length,
			added: diff.added,
			removed: diff.removed,
			flaggedCount: flagged,
			reviewedByUserId: null,
			reviewedAt: null,
			reviewNote: null,
		});
		await inBatches(doc.chunks, 10, (c) =>
			store.learning_resources.create({
				sourceId: source.id,
				versionId: version.id,
				ordinal: c.ordinal,
				subject: def.subject,
				yearGroups: c.yearGroups,
				kind: c.kind,
				heading: c.heading.slice(0, 400),
				text: c.text,
				checksum: c.checksum,
				objectiveCodes: c.objectiveCodes,
				flags: c.flags,
				status: "staged",
			}),
		);
		await store.knowledge_sources.update(source.id, { lastChangedAt: fetchedAt });
		await audit(
			store,
			{ userId: opts.actorUserId, familyId: null },
			"knowledge.stage",
			`knowledge_versions/${version.id}`,
			{
				sourceKey,
				trigger: opts.trigger,
				...stats,
				...diff,
			},
		);
		return store.ingestion_jobs.update(job.id, {
			status: "staged",
			versionId: version.id,
			finishedAt: nowIso(deps),
			stats: { ...stats, ...diff },
		});
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		await store.knowledge_sources.update(source.id, { lastCheckedAt: nowIso(deps) });
		return store.ingestion_jobs.update(job.id, {
			status: "failed",
			error: message.slice(0, 1000),
			finishedAt: nowIso(deps),
		});
	}
}

export async function reviewVersion(
	deps: Pick<KnowledgeDeps, "store" | "index" | "embedder" | "now">,
	reviewerUserId: string,
	versionId: string,
	decision: "approve" | "reject",
	note: string,
): Promise<KnowledgeVersionRecord> {
	const { store, index, embedder } = deps;
	const version = await store.knowledge_versions.get(versionId);
	if (!version) throw notFound("Version");
	if (version.status !== "staged") throw new AppError("conflict", "Only staged versions can be reviewed.");
	const review = { reviewedByUserId: reviewerUserId, reviewedAt: nowIso(deps), reviewNote: note };

	if (decision === "reject") {
		await markVersion(store, version, "rejected");
		await audit(
			store,
			{ userId: reviewerUserId, familyId: null },
			"knowledge.reject",
			`knowledge_versions/${versionId}`,
			{
				note,
			},
		);
		return store.knowledge_versions.update(versionId, review);
	}

	const resources = await store.learning_resources.list({ versionId }, { limit: 2000 });
	const clean = resources.filter((r) => r.flags.length === 0);
	const vectors = await embedder.embed(clean.map((r) => `${r.heading}\n${r.text}`));
	await index.upsert(
		clean.map((r, i) => ({
			vector: vectors[i] ?? [],
			payload: {
				resourceId: r.id,
				versionId,
				sourceId: r.sourceId,
				subject: r.subject,
				yearGroups: r.yearGroups,
				objectiveCodes: r.objectiveCodes,
				kind: r.kind,
				status: "approved",
				embedder: embedder.id,
			},
		})),
	);
	await inBatches(resources, 10, (r) =>
		store.learning_resources.update(r.id, { status: r.flags.length === 0 ? "approved" : "rejected" }),
	);
	const previous = (await store.knowledge_versions.list({ sourceId: version.sourceId, status: "approved" })).filter(
		(v) => v.id !== versionId,
	);
	for (const prev of previous) {
		await markVersion(store, prev, "superseded");
		await index.deleteVersion(prev.id);
	}
	const approved = await store.knowledge_versions.update(versionId, { ...review, status: "approved" });
	await audit(
		store,
		{ userId: reviewerUserId, familyId: null },
		"knowledge.approve",
		`knowledge_versions/${versionId}`,
		{
			note,
			indexed: clean.length,
			excludedFlagged: resources.length - clean.length,
			superseded: previous.map((p) => p.id),
		},
	);
	return approved;
}

export async function runDueChecks(deps: KnowledgeDeps) {
	const now = deps.now?.() ?? new Date();
	const sources = await syncSources(deps.store);
	const jobs: IngestionJobRecord[] = [];
	for (const s of sources.filter((x) => isDue(x, now))) {
		jobs.push(await runIngestion(deps, s.sourceKey, { trigger: "scheduled", actorUserId: null }));
	}
	return jobs;
}

export async function getKnowledgeOverview(store: DataStore, now = new Date()) {
	const sources = await syncSources(store);
	return Promise.all(
		sources.map(async (s) => {
			const def = getSourceDefinition(s.sourceKey);
			const versions = await store.knowledge_versions.list({ sourceId: s.id }, { limit: 500 });
			const jobs = await store.ingestion_jobs.list({ sourceId: s.id }, { limit: 500 });
			return {
				id: s.id,
				sourceKey: s.sourceKey,
				title: s.title,
				publisher: s.publisher,
				pageUrl: s.pageUrl,
				licence: s.licence,
				rightsNote: def?.rightsNote ?? "",
				rightsVerifiedAt: def?.rightsVerifiedAt ?? null,
				status: s.status,
				lastCheckedAt: s.lastCheckedAt,
				due: isDue(s, now),
				versions: versions
					.sort((a, b) => b.version - a.version)
					.slice(0, 10)
					.map((v) => ({
						id: v.id,
						version: v.version,
						status: v.status,
						fetchedAt: v.fetchedAt,
						upstreamUpdatedAt: v.upstreamUpdatedAt,
						chunkCount: v.chunkCount,
						added: v.added,
						removed: v.removed,
						flaggedCount: v.flaggedCount,
						reviewedAt: v.reviewedAt,
						reviewNote: v.reviewNote,
					})),
				jobs: jobs
					.slice(-5)
					.reverse()
					.map((j) => ({
						id: j.id,
						trigger: j.trigger,
						status: j.status,
						createdAt: j.createdAt,
						error: j.error,
					})),
			};
		}),
	);
}

export async function getVersionDetail(store: DataStore, versionId: string) {
	const version = await store.knowledge_versions.get(versionId);
	if (!version) throw notFound("Version");
	const resources = await store.learning_resources.list({ versionId }, { limit: 2000 });
	return {
		id: version.id,
		version: version.version,
		status: version.status,
		title: version.title,
		resources: resources
			.sort((a, b) => a.ordinal - b.ordinal)
			.map((r) => ({
				id: r.id,
				heading: r.heading,
				kind: r.kind,
				yearGroups: r.yearGroups,
				objectiveCodes: r.objectiveCodes,
				flags: r.flags,
				status: r.status,
				text: r.text,
			})),
	};
}
