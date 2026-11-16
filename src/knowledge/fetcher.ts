import { ALLOWED_FETCH_HOSTS } from "./sources";

export type JsonFetcher = (url: string) => Promise<unknown>;

const MAX_BYTES = 2 * 1024 * 1024;

export function createSafeJsonFetcher(fetchImpl: typeof fetch = fetch): JsonFetcher {
	return async (url) => {
		const target = new URL(url);
		if (target.protocol !== "https:") throw new Error("Only https sources are allowed");
		if (!ALLOWED_FETCH_HOSTS.has(target.hostname)) throw new Error(`Host not allowed: ${target.hostname}`);
		const res = await fetchImpl(target, {
			redirect: "error",
			headers: { accept: "application/json", "user-agent": "ai-tutor-knowledge-ingest/1.0" },
			signal: AbortSignal.timeout(20_000),
		});
		if (!res.ok) throw new Error(`Fetch failed: HTTP ${res.status}`);
		if (!(res.headers.get("content-type") ?? "").includes("application/json")) {
			throw new Error("Unexpected content type");
		}
		const declared = Number(res.headers.get("content-length") ?? 0);
		if (declared > MAX_BYTES) throw new Error("Document too large");
		const reader = res.body?.getReader();
		if (!reader) throw new Error("Empty response");
		const parts: Uint8Array[] = [];
		let size = 0;
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > MAX_BYTES) {
				await reader.cancel();
				throw new Error("Document too large");
			}
			parts.push(value);
		}
		return JSON.parse(Buffer.concat(parts).toString("utf8"));
	};
}
