import { describe, expect, it } from "vitest";
import { buildServerContext } from "#/server/backends";
import { loadConfig } from "#/server/config";
import { createHashEmbedder } from "./embedding";
import fixture from "./fixtures/govuk-maths-pos.json";
import { reviewVersion, runIngestion } from "./ingestion";
import { retrieveApprovedKnowledge } from "./retrieval";
import { createMemoryIndex } from "./vector-index";

const enabled = process.env.APPWRITE_IT === "1";

describe.skipIf(!enabled)("Appwrite knowledge tables (APPWRITE_IT=1, uses .env)", () => {
	it("persists the staged → approved lifecycle and retrieves from stored rows", async () => {
		process.loadEnvFile(".env");
		const { store } = buildServerContext(loadConfig({ ...process.env, KNOWLEDGE_INDEX: "memory" }));
		const deps = {
			store,
			index: createMemoryIndex(),
			embedder: createHashEmbedder(512),
			fetchJson: async () => structuredClone(fixture),
		};
		const created: string[] = [];
		try {
			const job = await runIngestion(deps, "dfe-nc-maths-pos", { trigger: "manual", actorUserId: "it" });
			expect(["staged", "unchanged"]).toContain(job.status);
			const versionId = job.versionId as string;
			if (job.status === "staged") created.push(versionId);
			const version = await store.knowledge_versions.get(versionId);
			if (version?.status === "staged") await reviewVersion(deps, "it", versionId, "approve", "integration");
			else {
				const rows = await store.learning_resources.list({ versionId, status: "approved" }, { limit: 2000 });
				await deps.index.upsert(
					rows.map((r) => ({
						vector: [],
						payload: { ...r, resourceId: r.id, status: "approved" as const, embedder: deps.embedder.id },
					})),
				);
			}
			const rows = await store.learning_resources.list({ versionId }, { limit: 2000 });
			expect(rows.length).toBeGreaterThan(5);
			expect(Array.isArray(rows[0]?.yearGroups)).toBe(true);
			if (created.length > 0) {
				const res = await retrieveApprovedKnowledge(deps, {
					query: "add and subtract numbers mentally",
					subject: "maths",
					yearGroups: [3],
					objectiveCode: "MA-Y3-AS-MENTAL",
				});
				expect(res.passages[0]?.objectiveCodes).toContain("MA-Y3-AS-MENTAL");
			}
		} finally {
			for (const versionId of created) {
				for (const r of await store.learning_resources.list({ versionId }, { limit: 2000 })) {
					await store.learning_resources.delete(r.id);
				}
				await store.knowledge_versions.delete(versionId);
			}
			const [source] = await store.knowledge_sources.list({ sourceKey: "dfe-nc-maths-pos" }, { limit: 1 });
			if (source) {
				for (const j of await store.ingestion_jobs.list({ sourceId: source.id }, { limit: 500 })) {
					await store.ingestion_jobs.delete(j.id);
				}
				await store.knowledge_sources.delete(source.id);
			}
		}
	}, 120_000);
});
