import { Client, TablesDB } from "node-appwrite";
import { createHashEmbedder, type Embedder } from "#/knowledge/embedding";
import { createMemoryIndex, createQdrantIndex, type VectorIndex } from "#/knowledge/vector-index";
import { type AuthProvider, createAppwriteAuth, createMemoryAuth } from "./auth/provider";
import { type AppConfig, loadConfig } from "./config";
import { createMemoryRateLimiter, type RateLimiter, setRateLimiter } from "./rate-limit";
import { createAppwriteRateLimiter } from "./rate-limit-appwrite";
import { createAppwriteSpeechCache, createMemorySpeechCache } from "./speech/cache";
import type { SpeechCache } from "./speech/speech";
import { createAppwriteStore } from "./store/appwrite-store";
import { createMemoryStore } from "./store/memory-store";
import type { DataStore } from "./store/types";

export type ServerContext = {
	config: AppConfig;
	store: DataStore;
	auth: AuthProvider;
	index: VectorIndex;
	embedder: Embedder;
	speechCache: SpeechCache;
	rateLimiter: RateLimiter;
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
		const rateLimiter =
			config.RATE_LIMIT_BACKEND === "appwrite"
				? createAppwriteRateLimiter(new TablesDB(admin), config.APPWRITE_DATABASE_ID)
				: createMemoryRateLimiter();
		return {
			config,
			store: createAppwriteStore(admin, config.APPWRITE_DATABASE_ID),
			auth: createAppwriteAuth(opts),
			index,
			embedder,
			speechCache: createAppwriteSpeechCache(admin),
			rateLimiter,
		};
	}
	console.warn("[ai-tutor] DATA_BACKEND=memory: data is lost on restart. Use only for development and tests.");
	return {
		config,
		store: createMemoryStore(),
		auth: createMemoryAuth(),
		index,
		embedder,
		speechCache: createMemorySpeechCache(),
		rateLimiter: createMemoryRateLimiter(),
	};
}

const KEY = Symbol.for("ai-tutor.server-context");
type Holder = { [KEY]?: ServerContext };

export function sharedServerContext(): ServerContext {
	const holder = globalThis as Holder;
	if (!holder[KEY]) {
		holder[KEY] = buildServerContext();
		setRateLimiter(holder[KEY].rateLimiter);
	}
	return holder[KEY];
}
