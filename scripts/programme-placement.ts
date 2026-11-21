import { Client } from "node-appwrite";
import { formatPlacement, placeAllLearners, readOnlyStore } from "#/server/services/placement";
import { createAppwriteStore } from "#/server/store/appwrite-store";

const env = process.env;
if (env.DATA_BACKEND !== "appwrite") {
	console.error("programme-placement reads real learners: set DATA_BACKEND=appwrite (memory has no data).");
	process.exit(1);
}
const missing = ["APPWRITE_ENDPOINT", "APPWRITE_PROJECT_ID", "APPWRITE_API_KEY"].filter((k) => !env[k]);
if (missing.length > 0) {
	console.error(`programme-placement: missing ${missing.join(", ")}`);
	process.exit(1);
}

const databaseId = env.APPWRITE_DATABASE_ID ?? "ai_tutor";
const client = new Client()
	.setEndpoint(env.APPWRITE_ENDPOINT as string)
	.setProject(env.APPWRITE_PROJECT_ID as string)
	.setKey(env.APPWRITE_API_KEY as string);
const store = readOnlyStore(createAppwriteStore(client, databaseId));

console.info(
	`Programme placement (read-only) — ${env.APPWRITE_ENDPOINT} project ${env.APPWRITE_PROJECT_ID} db ${databaseId}`,
);
const placements = await placeAllLearners(store);
for (const p of placements) console.info(`\n${formatPlacement(p)}`);
console.info(`\n${placements.length} learner(s) placed; nothing was written.`);
