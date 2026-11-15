import "@tanstack/react-start/server-only";
import { Client } from "node-appwrite";
import { type AuthProvider, createAppwriteAuth, createMemoryAuth } from "./auth/provider";
import { type AppConfig, loadConfig } from "./config";
import { createAppwriteStore } from "./store/appwrite-store";
import { createMemoryStore } from "./store/memory-store";
import type { DataStore } from "./store/types";

export type ServerContext = { config: AppConfig; store: DataStore; auth: AuthProvider };

const KEY = Symbol.for("ai-tutor.server-context");
type Holder = { [KEY]?: ServerContext };

function build(): ServerContext {
	const config = loadConfig();
	if (config.DATA_BACKEND === "appwrite") {
		const opts = {
			endpoint: config.APPWRITE_ENDPOINT as string,
			projectId: config.APPWRITE_PROJECT_ID as string,
			apiKey: config.APPWRITE_API_KEY as string,
		};
		const admin = new Client().setEndpoint(opts.endpoint).setProject(opts.projectId).setKey(opts.apiKey);
		return { config, store: createAppwriteStore(admin, config.APPWRITE_DATABASE_ID), auth: createAppwriteAuth(opts) };
	}
	console.warn("[ai-tutor] DATA_BACKEND=memory: data is lost on restart. Use only for development and tests.");
	return { config, store: createMemoryStore(), auth: createMemoryAuth() };
}

export function getServerContext(): ServerContext {
	const holder = globalThis as Holder;
	holder[KEY] ??= build();
	return holder[KEY];
}
