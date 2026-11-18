import { type Client, Storage } from "node-appwrite";
import { InputFile } from "node-appwrite/file";
import type { SpeechCache } from "./speech";

export const SPEECH_BUCKET = "speech";

export function createMemorySpeechCache(limit = 500): SpeechCache {
	const clips = new Map<string, Uint8Array>();
	return {
		get: async (key) => clips.get(key) ?? null,
		put: async (key, audio) => {
			clips.set(key, audio);
			if (clips.size > limit) clips.delete(clips.keys().next().value as string);
		},
	};
}

const code = (e: unknown) => (e as { code?: number }).code;

export function createAppwriteSpeechCache(client: Client, bucketId = SPEECH_BUCKET): SpeechCache {
	const storage = new Storage(client);
	return {
		get: async (fileId) => {
			try {
				return new Uint8Array(await storage.getFileDownload({ bucketId, fileId }));
			} catch (e) {
				if (code(e) === 404) return null;
				throw e;
			}
		},
		put: async (fileId, audio) => {
			try {
				await storage.createFile({ bucketId, fileId, file: InputFile.fromBuffer(audio, `${fileId}.mp3`) });
			} catch (e) {
				if (code(e) !== 409) throw e;
			}
		},
	};
}
