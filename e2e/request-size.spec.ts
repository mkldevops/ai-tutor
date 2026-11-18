import { expect, test } from "@playwright/test";

test("the server refuses oversized request bodies before any handler runs", async ({ request }) => {
	const big = "x".repeat(6 * 1024 * 1024 + 1);
	const fn = await request.post("/_serverFn/does-not-matter", {
		data: big,
		headers: { "content-type": "application/json" },
	});
	expect(fn.status()).toBe(413);
	const page = await request.post("/", { data: "x".repeat(64 * 1024 + 1) });
	expect(page.status()).toBe(413);
	const small = await request.get("/");
	expect(small.status()).toBe(200);
});
