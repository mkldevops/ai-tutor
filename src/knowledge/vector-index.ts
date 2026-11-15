import { createHash } from "node:crypto";

export type IndexPayload = {
	resourceId: string;
	versionId: string;
	sourceId: string;
	subject: string;
	yearGroups: number[];
	objectiveCodes: string[];
	kind: string;
	status: "approved";
	embedder: string;
};

export type IndexPoint = { vector: number[]; payload: IndexPayload };
export type SearchFilter = { subject: string; yearGroups: number[]; embedder: string };
export type SearchHit = { score: number; payload: IndexPayload };

export interface VectorIndex {
	readonly kind: "memory" | "qdrant";
	upsert(points: IndexPoint[]): Promise<void>;
	search(vector: number[], filter: SearchFilter, limit: number): Promise<SearchHit[]>;
	deleteVersion(versionId: string): Promise<void>;
}

export function pointId(resourceId: string): string {
	const h = createHash("sha256").update(resourceId).digest("hex");
	return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

const cosine = (a: number[], b: number[]) => {
	let dot = 0;
	let na = 0;
	let nb = 0;
	for (let i = 0; i < a.length; i++) {
		const x = a[i] ?? 0;
		const y = b[i] ?? 0;
		dot += x * y;
		na += x * x;
		nb += y * y;
	}
	return na && nb ? dot / Math.sqrt(na * nb) : 0;
};

export function createMemoryIndex(): VectorIndex {
	const points = new Map<string, IndexPoint>();
	return {
		kind: "memory",
		async upsert(list) {
			for (const p of list) points.set(pointId(p.payload.resourceId), structuredClone(p));
		},
		async search(vector, filter, limit) {
			return [...points.values()]
				.filter(
					(p) =>
						p.payload.status === "approved" &&
						p.payload.subject === filter.subject &&
						p.payload.embedder === filter.embedder &&
						p.payload.yearGroups.some((y) => filter.yearGroups.includes(y)),
				)
				.map((p) => ({ score: cosine(vector, p.vector), payload: structuredClone(p.payload) }))
				.sort((a, b) => b.score - a.score)
				.slice(0, limit);
		},
		async deleteVersion(versionId) {
			for (const [id, p] of points) if (p.payload.versionId === versionId) points.delete(id);
		},
	};
}

type QdrantOptions = { url: string; apiKey?: string; collection: string; dimensions: number; fetch?: typeof fetch };

export function createQdrantIndex(opts: QdrantOptions): VectorIndex {
	const doFetch = opts.fetch ?? fetch;
	const base = opts.url.replace(/\/+$/, "");
	const col = encodeURIComponent(opts.collection);
	let ready: Promise<void> | null = null;

	async function call(method: string, path: string, body?: unknown, allow404 = false) {
		const res = await doFetch(`${base}${path}`, {
			method,
			headers: {
				"content-type": "application/json",
				...(opts.apiKey ? { "api-key": opts.apiKey } : {}),
			},
			body: body === undefined ? undefined : JSON.stringify(body),
			signal: AbortSignal.timeout(15_000),
		});
		if (allow404 && res.status === 404) return null;
		if (!res.ok) throw new Error(`Qdrant ${method} ${path} failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
		return (await res.json()) as { result: unknown };
	}

	async function ensure() {
		const existing = await call("GET", `/collections/${col}`, undefined, true);
		if (!existing) {
			await call("PUT", `/collections/${col}`, { vectors: { size: opts.dimensions, distance: "Cosine" } });
		}
		const fields: [string, string][] = [
			["status", "keyword"],
			["subject", "keyword"],
			["embedder", "keyword"],
			["versionId", "keyword"],
			["yearGroups", "integer"],
		];
		for (const [field_name, field_schema] of fields) {
			await call("PUT", `/collections/${col}/index?wait=true`, { field_name, field_schema });
		}
	}

	const init = () => {
		ready ??= ensure().catch((e) => {
			ready = null;
			throw e;
		});
		return ready;
	};

	return {
		kind: "qdrant",
		async upsert(list) {
			if (list.length === 0) return;
			await init();
			await call("PUT", `/collections/${col}/points?wait=true`, {
				points: list.map((p) => ({ id: pointId(p.payload.resourceId), vector: p.vector, payload: p.payload })),
			});
		},
		async search(vector, filter, limit) {
			await init();
			const res = await call("POST", `/collections/${col}/points/query`, {
				query: vector,
				limit,
				with_payload: true,
				filter: {
					must: [
						{ key: "status", match: { value: "approved" } },
						{ key: "subject", match: { value: filter.subject } },
						{ key: "embedder", match: { value: filter.embedder } },
						{ key: "yearGroups", match: { any: filter.yearGroups } },
					],
				},
			});
			const points = (res?.result as { points?: { score: number; payload: IndexPayload }[] })?.points ?? [];
			return points.map((p) => ({ score: p.score, payload: p.payload }));
		},
		async deleteVersion(versionId) {
			await init();
			await call("POST", `/collections/${col}/points/delete?wait=true`, {
				filter: { must: [{ key: "versionId", match: { value: versionId } }] },
			});
		},
	};
}
