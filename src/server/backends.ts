import { Client } from "node-appwrite";
import { createHashEmbedder, type Embedder } from "#/knowledge/embedding";
import { createMemoryIndex, createQdrantIndex, type VectorIndex } from "#/knowledge/vector-index";
import { type AuthProvider, createAppwriteAuth, createMemoryAuth } from "./auth/provider";
import { type AppConfig, loadConfig } from "./config";
import { createAppwriteStore } from "./store/appwrite-store";
import { createMemoryStore } from "./store/memory-store";
import type { DataStore } from "./store/types";

export type ServerContext = {
	config: AppConfig;
	store: DataStore;
	auth: AuthProvider;
	index: VectorIndex;
	embedder: Embedder;
};

function buildIndex(config: AppConfig, embedder: Embedder): VectorIndex {
	if (config.KNOWLEDGE_INDEX === "qdrant") {
		return createQdrantIndex({
			url: config.QDRANT_URL as string,
			apiKey: config.QDRANT_API_KEY,
			collection: `${config.QDRANT_COLLECTION}_${embedder.id.replace(/[^a-z0-9]+/g, "_")}`,
			dimensions: embedder.dimensions,
		});
	}
	return createMemoryIndex();
}

export function buildServerContext(config: AppConfig = loadConfig()): ServerContext {
	const embedder = createHashEmbedder(512);
	const index = buildIndex(config, embedder);
	if (config.DATA_BACKEND === "appwrite") {
		const opts = {
			endpoint: config.APPWRITE_ENDPOINT as string,
			projectId: config.APPWRITE_PROJECT_ID as string,
			apiKey: config.APPWRITE_API_KEY as string,
		};
		const admin = new Client().setEndpoint(opts.endpoint).setProject(opts.projectId).setKey(opts.apiKey);
		return {
			config,
			store: createAppwriteStore(admin, config.APPWRITE_DATABASE_ID),
			auth: createAppwriteAuth(opts),
			index,
			embedder,
		};
	}
	console.warn("[ai-tutor] DATA_BACKEND=memory: data is lost on restart. Use only for development and tests.");
	return { config, store: createMemoryStore(), auth: createMemoryAuth(), index, embedder };
}

const KEY = Symbol.for("ai-tutor.server-context");
type Holder = { [KEY]?: ServerContext };

export function sharedServerContext(): ServerContext {
	const holder = globalThis as Holder;
	holder[KEY] ??= buildServerContext();
	return holder[KEY];
}
