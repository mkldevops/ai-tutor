import type { DataStore, KnowledgeSourceRecord, KnowledgeVersionRecord } from "#/server/store/types";
import type { Embedder } from "./embedding";
import { detectInjection, normalizeText } from "./pipeline";
import { getSourceDefinition } from "./sources";
import type { VectorIndex } from "./vector-index";

export type RetrievalDeps = { store: DataStore; index: VectorIndex; embedder: Embedder };

export type RetrievalQuery = {
	query: string;
	subject: string;
	yearGroups: number[];
	objectiveCode?: string;
	limit?: number;
	minScore?: number;
};

export type Citation = {
	publisher: string;
	title: string;
	url: string;
	licence: string;
	attribution: string;
	version: number;
	retrievedAt: string;
	upstreamUpdatedAt: string | null;
};

export type Passage = {
	resourceId: string;
	heading: string;
	kind: string;
	objectiveCodes: string[];
	text: string;
	score: number;
	citation: Citation;
};

export type RetrievalResult = { passages: Passage[]; insufficientEvidence: boolean };

const OBJECTIVE_BOOST = 0.15;
const MAX_PASSAGE_CHARS = 1200;

export async function retrieveApprovedKnowledge(deps: RetrievalDeps, q: RetrievalQuery): Promise<RetrievalResult> {
	const query = normalizeText(q.query).slice(0, 500);
	const limit = Math.min(Math.max(q.limit ?? 4, 1), 8);
	if (!query || q.yearGroups.length === 0) return { passages: [], insufficientEvidence: true };

	const [vector] = await deps.embedder.embed([query]);
	if (!vector) return { passages: [], insufficientEvidence: true };
	const hits = await deps.index.search(
		vector,
		{ subject: q.subject, yearGroups: q.yearGroups, embedder: deps.embedder.id },
		limit * 3,
	);

	const versions = new Map<string, KnowledgeVersionRecord | null>();
	const sources = new Map<string, KnowledgeSourceRecord | null>();
	const passages: Passage[] = [];
	for (const hit of hits) {
		const r = await deps.store.learning_resources.get(hit.payload.resourceId);
		if (!r || r.status !== "approved" || r.flags.length > 0 || r.versionId !== hit.payload.versionId) continue;
		if (detectInjection(r.text).length > 0) continue;
		if (!versions.has(r.versionId)) versions.set(r.versionId, await deps.store.knowledge_versions.get(r.versionId));
		const version = versions.get(r.versionId);
		if (!version || version.status !== "approved") continue;
		if (!sources.has(r.sourceId)) sources.set(r.sourceId, await deps.store.knowledge_sources.get(r.sourceId));
		const source = sources.get(r.sourceId);
		if (!source || source.status !== "active") continue;
		const score = hit.score + (q.objectiveCode && r.objectiveCodes.includes(q.objectiveCode) ? OBJECTIVE_BOOST : 0);
		if (score < (q.minScore ?? 0.12)) continue;
		passages.push({
			resourceId: r.id,
			heading: r.heading,
			kind: r.kind,
			objectiveCodes: r.objectiveCodes,
			text: r.text.slice(0, MAX_PASSAGE_CHARS),
			score: Math.round(score * 1000) / 1000,
			citation: {
				publisher: source.publisher,
				title: source.title,
				url: source.pageUrl,
				licence: source.licence,
				attribution: getSourceDefinition(source.sourceKey)?.attribution ?? source.licence,
				version: version.version,
				retrievedAt: version.fetchedAt,
				upstreamUpdatedAt: version.upstreamUpdatedAt,
			},
		});
	}
	passages.sort((a, b) => b.score - a.score);
	const top = passages.slice(0, limit);
	return { passages: top, insufficientEvidence: top.length === 0 };
}
