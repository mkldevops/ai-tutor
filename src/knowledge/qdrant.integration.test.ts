import { describe, expect, it } from "vitest";
import { createMemoryStore } from "#/server/store/memory-store";
import { createHashEmbedder } from "./embedding";
import fixture from "./fixtures/govuk-maths-pos.json";
import { reviewVersion, runIngestion } from "./ingestion";
import { retrieveApprovedKnowledge } from "./retrieval";
import { createQdrantIndex } from "./vector-index";

const url = process.env.QDRANT_TEST_URL;

describe.skipIf(!url)("Qdrant integration (QDRANT_TEST_URL)", () => {
	it("indexes an approved version, filters by year and removes superseded vectors", async () => {
		const embedder = createHashEmbedder(512);
		const collection = `ai_tutor_it_${Date.now()}`;
		const apiKey = process.env.QDRANT_TEST_API_KEY;
		const index = createQdrantIndex({ url: url as string, apiKey, collection, dimensions: embedder.dimensions });
		const store = createMemoryStore();
		let payload: unknown = fixture;
		const deps = { store, index, embedder, fetchJson: async () => structuredClone(payload) };
		const query = { subject: "maths", yearGroups: [3], objectiveCode: "MA-Y3-AS-MENTAL" };
		try {
			const j1 = await runIngestion(deps, "dfe-nc-maths-pos", { trigger: "manual", actorUserId: "a" });
			await reviewVersion(deps, "a", j1.versionId as string, "approve", "integration");
			const r1 = await retrieveApprovedKnowledge(deps, { ...query, query: "add and subtract numbers mentally" });
			expect(r1.passages[0]?.objectiveCodes).toContain("MA-Y3-AS-MENTAL");
			expect(r1.passages[0]?.citation.version).toBe(1);

			const y5 = await index.search(
				(await embedder.embed(["mentally"]))[0] ?? [],
				{ ...query, yearGroups: [5], embedder: embedder.id },
				50,
			);
			expect(y5.every((h) => h.payload.yearGroups.includes(5))).toBe(true);

			const doc = structuredClone(fixture);
			doc.details.body +=
				"<h2>Year 3 programme of study</h2><h3>Number - addition and subtraction</h3><p>Pupils bridge tens on a number line.</p>";
			payload = doc;
			const j2 = await runIngestion(deps, "dfe-nc-maths-pos", { trigger: "manual", actorUserId: "a" });
			await reviewVersion(deps, "a", j2.versionId as string, "approve", "integration v2");
			const all = await index.search(
				(await embedder.embed(["number"]))[0] ?? [],
				{ ...query, yearGroups: [3, 4, 5], embedder: embedder.id },
				500,
			);
			expect(all.length).toBeGreaterThan(0);
			expect(all.every((h) => h.payload.versionId === j2.versionId)).toBe(true);
		} finally {
			await fetch(`${url}/collections/${collection}`, {
				method: "DELETE",
				headers: apiKey ? { "api-key": apiKey } : {},
			});
		}
	}, 60_000);
});
