import { defineTask } from "nitro/task";
import { createSafeJsonFetcher } from "#/knowledge/fetcher";
import { runDueChecks } from "#/knowledge/ingestion";
import { sharedServerContext } from "#/server/backends";

export default defineTask({
	meta: { name: "knowledge:check", description: "Stage new versions of due knowledge sources (approval stays manual)" },
	async run() {
		const { config, store, index, embedder } = sharedServerContext();
		if (!config.KNOWLEDGE_AUTO_CHECK) return { result: "disabled" };
		const jobs = await runDueChecks({ store, index, embedder, fetchJson: createSafeJsonFetcher() });
		const summary = jobs.map((j) => ({ sourceId: j.sourceId, status: j.status, error: j.error }));
		console.info("[ai-tutor] knowledge check", summary);
		return { result: JSON.stringify(summary) };
	},
});
