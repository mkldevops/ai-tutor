import { describe, expect, it } from "vitest";
import { createHashEmbedder } from "./embedding";
import { createSafeJsonFetcher } from "./fetcher";
import { createQdrantIndex, type IndexPayload, pointId } from "./vector-index";

type Call = { method: string; url: string; body: unknown; headers: Record<string, string> };

function fakeQdrant(existing = false) {
	const calls: Call[] = [];
	const fetchImpl = (async (url: string, init: RequestInit) => {
		const method = init.method ?? "GET";
		calls.push({
			method,
			url,
			body: init.body ? JSON.parse(String(init.body)) : undefined,
			headers: init.headers as Record<string, string>,
		});
		if (method === "GET" && !existing) return new Response("{}", { status: 404 });
		const result = url.endsWith("/points/query")
			? { points: [{ id: "x", score: 0.9, payload: { resourceId: "r1" } }] }
			: true;
		return Response.json({ result });
	}) as typeof fetch;
	return { calls, fetchImpl };
}

const payload: IndexPayload = {
	resourceId: "r1",
	versionId: "v1",
	sourceId: "s1",
	subject: "maths",
	yearGroups: [3],
	objectiveCodes: [],
	kind: "statutory",
	status: "approved",
	embedder: "hash-v1-8",
};

describe("Qdrant index adapter", () => {
	it("creates the collection once, sends the api key and filters searches", async () => {
		const { calls, fetchImpl } = fakeQdrant();
		const index = createQdrantIndex({
			url: "http://qdrant:6333/",
			apiKey: "k",
			collection: "c",
			dimensions: 8,
			fetch: fetchImpl,
		});
		await index.upsert([{ vector: [1, 0, 0, 0, 0, 0, 0, 0], payload }]);
		const hits = await index.search(
			[1, 0, 0, 0, 0, 0, 0, 0],
			{ subject: "maths", yearGroups: [3], embedder: "hash-v1-8" },
			4,
		);
		await index.deleteVersion("v1");

		expect(calls.filter((c) => c.method === "GET")).toHaveLength(1);
		expect(calls.find((c) => c.method === "PUT" && c.url.endsWith("/collections/c"))?.body).toEqual({
			vectors: { size: 8, distance: "Cosine" },
		});
		expect(calls.every((c) => c.headers["api-key"] === "k")).toBe(true);
		const upsert = calls.find((c) => c.url.includes("/points?wait=true"))?.body as { points: { id: string }[] };
		expect(upsert.points[0]?.id).toBe(pointId("r1"));
		const query = calls.find((c) => c.url.endsWith("/points/query"))?.body as { filter: { must: unknown[] } };
		expect(query.filter.must).toEqual(
			expect.arrayContaining([
				{ key: "status", match: { value: "approved" } },
				{ key: "yearGroups", match: { any: [3] } },
				{ key: "embedder", match: { value: "hash-v1-8" } },
			]),
		);
		expect(hits[0]?.payload.resourceId).toBe("r1");
		const del = calls.find((c) => c.url.includes("/points/delete"))?.body;
		expect(del).toEqual({ filter: { must: [{ key: "versionId", match: { value: "v1" } }] } });
	});
});

describe("hash embedder", () => {
	it("is deterministic, normalised and ranks lexical overlap higher", async () => {
		const e = createHashEmbedder(256);
		const [a, b, c] = await e.embed(["add numbers mentally", "add numbers mentally", "fractions of shapes"]);
		expect(a).toEqual(b);
		const dot = (x: number[], y: number[]) => x.reduce((s, v, i) => s + v * (y[i] ?? 0), 0);
		expect(dot(a ?? [], a ?? [])).toBeCloseTo(1);
		const [q] = await e.embed(["mentally add"]);
		expect(dot(q ?? [], a ?? [])).toBeGreaterThan(dot(q ?? [], c ?? []));
	});
});

describe("safe JSON fetcher", () => {
	const ok = (body: string, headers: Record<string, string> = { "content-type": "application/json" }) =>
		(async () => new Response(body, { headers })) as unknown as typeof fetch;

	it("rejects non-https and non-allowlisted hosts before fetching", async () => {
		let called = false;
		const spy = (async () => {
			called = true;
			return new Response("{}");
		}) as unknown as typeof fetch;
		await expect(createSafeJsonFetcher(spy)("http://www.gov.uk/api/content/x")).rejects.toThrow(/https/);
		await expect(createSafeJsonFetcher(spy)("https://evil.example/api")).rejects.toThrow(/Host not allowed/);
		expect(called).toBe(false);
	});

	it("rejects wrong content types and oversized bodies", async () => {
		await expect(
			createSafeJsonFetcher(ok("<html>", { "content-type": "text/html" }))("https://www.gov.uk/a"),
		).rejects.toThrow(/content type/);
		const big = `"${"x".repeat(2 * 1024 * 1024 + 10)}"`;
		await expect(createSafeJsonFetcher(ok(big))("https://www.gov.uk/a")).rejects.toThrow(/too large/);
	});

	it("parses an allowed JSON document", async () => {
		expect(await createSafeJsonFetcher(ok('{"a":1}'))("https://www.gov.uk/api/content/x")).toEqual({ a: 1 });
	});
});
