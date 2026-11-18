import { createHash } from "node:crypto";

export const MAX_SPEECH_CHARS = 600;

export type SpeechCache = {
	get(key: string): Promise<Uint8Array | null>;
	put(key: string, audio: Uint8Array): Promise<void>;
};

export type SpeechDeps = {
	cache: SpeechCache;
	apiKey?: string;
	voiceId: string;
	modelId: string;
	fetch?: typeof fetch;
	beforeGenerate?: () => void;
};

export function speechKey(voiceId: string, modelId: string, text: string): string {
	return createHash("sha256").update(`${voiceId}\n${modelId}\n${text}`).digest("hex").slice(0, 36);
}

export async function synthesize(deps: SpeechDeps, raw: string): Promise<Uint8Array | null> {
	const text = raw.replace(/\s+/g, " ").trim();
	if (!deps.apiKey || !text || text.length > MAX_SPEECH_CHARS) return null;
	const key = speechKey(deps.voiceId, deps.modelId, text);
	const cached = await deps.cache.get(key).catch(() => null);
	if (cached) return cached;

	deps.beforeGenerate?.();
	const res = await (deps.fetch ?? fetch)(
		`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(deps.voiceId)}?output_format=mp3_44100_64`,
		{
			method: "POST",
			headers: { "xi-api-key": deps.apiKey, "content-type": "application/json", accept: "audio/mpeg" },
			body: JSON.stringify({ text, model_id: deps.modelId, language_code: "en" }),
			signal: AbortSignal.timeout(10_000),
		},
	);
	if (!res.ok) throw new Error(`ElevenLabs returned ${res.status}`);
	const audio = new Uint8Array(await res.arrayBuffer());
	await deps.cache.put(key, audio).catch((e) => console.warn("[ai-tutor] speech cache write failed", e));
	return audio;
}
