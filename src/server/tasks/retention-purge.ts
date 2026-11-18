import { defineTask } from "nitro/task";
import { sharedServerContext } from "#/server/backends";
import { purgeExpiredData, retentionPolicy } from "#/server/services/retention";

export default defineTask({
	meta: {
		name: "retention:purge",
		description: "Delete ephemeral child data past its retention window (dry run unless RETENTION_PURGE_ENABLED)",
	},
	async run() {
		const { config, store, rateLimiter } = sharedServerContext();
		const report = await purgeExpiredData({ store, rateLimiter }, retentionPolicy(config), {
			dryRun: !config.RETENTION_PURGE_ENABLED,
		});
		console.info("[ai-tutor] retention purge", report);
		return { result: JSON.stringify(report) };
	},
});
