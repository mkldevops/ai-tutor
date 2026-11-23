import { expect, type Page, test } from "@playwright/test";

async function signUp(page: Page, email: string) {
	await page.goto("/signup", { waitUntil: "networkidle" });
	await page.getByLabel("Your name").fill("Parent");
	await page.getByLabel(/Family name/).fill("Test family");
	await page.getByLabel("Email").fill(email);
	await page.getByLabel(/Password/).fill("correct-horse-battery");
	await page.getByRole("button", { name: "Create account" }).click();
	await expect(page.getByRole("heading", { name: "Your learners" })).toBeVisible();
}

test.skip(!!process.env.E2E_BASE_URL, "Admin allowlist is only configured for the local web server");

test("non-admin parents cannot see the knowledge admin", async ({ page }) => {
	await signUp(page, `parent-${Date.now()}@example.test`);
	await page.getByRole("button", { name: "Account menu" }).click();
	await expect(page.getByRole("menuitem", { name: "Sign out" })).toBeVisible();
	await expect(page.getByRole("menuitem", { name: "Knowledge" })).toHaveCount(0);
	await page.goto("/knowledge");
	await expect(page.getByRole("heading", { name: "Knowledge sources" })).toHaveCount(0);
});

async function signUpOrIn(page: Page, email: string) {
	await page.goto("/signup", { waitUntil: "networkidle" });
	await page.getByLabel("Your name").fill("Admin");
	await page.getByLabel(/Family name/).fill("Admin family");
	await page.getByLabel("Email").fill(email);
	await page.getByLabel(/Password/).fill("correct-horse-battery");
	await page.getByRole("button", { name: "Create account" }).click();
	const outcome = await Promise.race([
		page
			.getByRole("heading", { name: "Your learners" })
			.waitFor()
			.then(() => "in" as const),
		page
			.getByRole("alert")
			.waitFor()
			.then(() => "exists" as const),
	]);
	if (outcome === "in") return;
	await page.goto("/login", { waitUntil: "networkidle" });
	await page.getByLabel("Email").fill(email);
	await page.getByLabel(/Password/).fill("correct-horse-battery");
	await page.getByRole("button", { name: "Sign in" }).click();
	await expect(page.getByRole("heading", { name: "Your learners" })).toBeVisible();
}

test("knowledge admin sees the source registry with licence details", async ({ page }) => {
	await signUpOrIn(page, "knowledge-admin@example.test");
	await page.getByRole("button", { name: "Account menu" }).click();
	await page.getByRole("menuitem", { name: "Knowledge" }).click();
	await expect(page.getByRole("heading", { name: "Knowledge sources" })).toBeVisible();
	await expect(page.getByText("National curriculum in England: mathematics programmes of study")).toBeVisible();
	await expect(page.getByText(/Open Government Licence v3\.0/).first()).toBeVisible();
	await expect(page.getByRole("button", { name: "Check for updates" })).toBeEnabled();
});

test.describe("knowledge admin behind the parent PIN", () => {
	test.skip(process.env.E2E_DATA_BACKEND === "appwrite", "Needs a fresh admin account on every run");
	test.use({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100.86" } });

	const fnId = (url: string) =>
		JSON.parse(Buffer.from(new URL(url).pathname.split("/_serverFn/")[1] ?? "", "base64url").toString());
	const fnUrl = (sample: string, name: string) => {
		const id = Buffer.from(JSON.stringify({ ...fnId(sample), export: `${name}_createServerFn_handler` })).toString(
			"base64url",
		);
		return `${new URL(sample).origin}/_serverFn/${id}`;
	};
	const payload = (data: Record<string, string>) => {
		const k = Object.keys(data);
		const v = k.map((key) => ({ t: 1, s: data[key] }));
		const inner = { t: 10, i: 1, p: { k, v }, o: 0 };
		return JSON.stringify({ t: { t: 10, i: 0, p: { k: ["data"], v: [inner] }, o: 0 }, f: 127, m: [] });
	};

	test("a locked admin cannot reach the knowledge page nor call its functions", async ({ page }) => {
		await signUpOrIn(page, "knowledge-pin-admin@example.test");
		await page.goto("/settings", { waitUntil: "networkidle" });
		const section = page.locator("#parent-pin");
		await section.getByLabel("Account password").fill("correct-horse-battery");
		await section.getByLabel(/New parent PIN/).fill("4826");
		await section.getByLabel("Repeat the PIN").fill("4826");
		await section.getByRole("button", { name: "Set PIN" }).click();
		await expect(section.getByRole("button", { name: "Lock now" })).toBeVisible();

		const gets: string[] = [];
		page.on("request", (r) => {
			if (
				r.url().includes("/_serverFn/") &&
				r.method() === "GET" &&
				/getKnowledgeOverviewFn/.test(fnId(r.url()).export)
			)
				gets.push(r.url());
		});
		let ingest: { url: string; body: string; headers: Record<string, string> } | null = null;
		await page.route("**/_serverFn/**", async (route) => {
			const r = route.request();
			if (r.method() !== "POST" || !/runIngestionFn/.test(fnId(r.url()).export)) return route.fallback();
			const { cookie: _c, host: _h, "content-length": _l, ...headers } = r.headers();
			ingest = { url: r.url(), body: r.postData() ?? "", headers };
			return route.abort();
		});

		await page.getByRole("button", { name: "Account menu" }).click();
		await page.getByRole("menuitem", { name: "Knowledge" }).click();
		await expect(page.getByRole("heading", { name: "Knowledge sources" })).toBeVisible();
		await page.getByRole("button", { name: "Check for updates" }).first().click();
		await expect.poll(() => ingest).not.toBeNull();
		await page.unroute("**/_serverFn/**");
		const captured = ingest as unknown as { url: string; body: string; headers: Record<string, string> };
		const sourceKey = JSON.parse(captured.body).t.p.v[0].p.v[0].s as string;
		expect(JSON.parse(payload({ sourceKey })).t).toEqual(JSON.parse(captured.body).t);

		const overviewUrl = gets[0] as string;
		expect(overviewUrl).toBeDefined();
		expect((await page.request.get(overviewUrl)).status()).toBe(200);

		await page.getByRole("button", { name: "Account menu" }).click();
		await page.getByRole("menuitem", { name: "Lock parent area" }).click();
		await expect(page.getByRole("heading", { name: /Locked/ })).toBeVisible();

		await page.getByRole("button", { name: "Account menu" }).click();
		await expect(page.getByRole("menuitem", { name: "Sign out" })).toBeVisible();
		await expect(page.getByRole("menuitem", { name: "Knowledge" })).toHaveCount(0);
		await page.keyboard.press("Escape");

		await page.goto("/knowledge", { waitUntil: "networkidle" });
		await expect(page.getByRole("heading", { name: /Locked/ })).toBeVisible();
		await expect(page.getByRole("heading", { name: "Knowledge sources" })).toHaveCount(0);

		const versionUrl = `${fnUrl(overviewUrl, "getKnowledgeVersionFn")}?${new URLSearchParams({
			payload: payload({ versionId: "missing-version" }),
		})}`;
		const post = (url: string, data: Record<string, string>) =>
			page.request.post(url, { data: payload(data), headers: captured.headers });
		const calls = {
			getKnowledgeOverviewFn: await page.request.get(overviewUrl),
			getKnowledgeVersionFn: await page.request.get(versionUrl, { headers: { "x-tsr-serverFn": "true" } }),
			runIngestionFn: await post(captured.url, { sourceKey }),
			reviewKnowledgeVersionFn: await post(fnUrl(overviewUrl, "reviewKnowledgeVersionFn"), {
				versionId: "missing-version",
				decision: "approve",
				note: "Looks fine",
			}),
		};
		for (const [name, res] of Object.entries(calls)) expect(res.status(), name).toBe(403);

		await page.getByLabel("PIN", { exact: true }).fill("4826");
		await page.getByRole("button", { name: "Unlock" }).click();
		await expect(page.getByRole("heading", { name: "Knowledge sources" })).toBeVisible();
		expect((await page.request.get(overviewUrl)).status()).toBe(200);
	});
});
