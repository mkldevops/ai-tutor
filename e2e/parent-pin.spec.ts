import { expect, type Page, test } from "@playwright/test";
import { addLearner, signUp } from "./lesson-helpers";

const PASSWORD = "correct-horse-battery";

test.use({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100.64" } });

async function setPin(page: Page, pin: string) {
	await page.goto("/settings", { waitUntil: "networkidle" });
	const section = page.locator("#parent-pin");
	await section.getByLabel("Account password").fill(PASSWORD);
	await section.getByLabel(/New parent PIN/).fill(pin);
	await section.getByLabel("Repeat the PIN").fill(pin);
	await section.getByRole("button", { name: "Set PIN" }).click();
	await expect(section.getByRole("button", { name: "Lock now" })).toBeVisible();
}

async function lock(page: Page) {
	await page.getByRole("button", { name: "Account menu" }).click();
	await page.getByRole("menuitem", { name: "Lock parent area" }).click();
}

test("the parent PIN locks reports and settings, and the server refuses direct calls", async ({ page }) => {
	await signUp(page, `pin-${Date.now()}@example.test`);
	await addLearner(page, "Ava", "3");
	await expect(page.getByTestId("pin-prompt")).toBeVisible();
	await setPin(page, "4826");

	const calls = new Set<string>();
	page.on("request", (r) => {
		if (r.url().includes("/_serverFn/") && r.method() === "GET") calls.add(r.url());
	});
	await page.getByRole("button", { name: "Account menu" }).click();
	await page.getByRole("menuitem", { name: "Dashboard" }).click();
	await expect(page.getByRole("heading", { name: "Your learners" })).toBeVisible();
	await expect(page.getByTestId("pin-prompt")).toHaveCount(0);
	const replay = async () =>
		Promise.all([...calls].map(async (url) => ({ url, status: (await page.request.get(url)).status() })));
	expect((await replay()).every((c) => c.status === 200)).toBe(true);

	await lock(page);
	await expect(page.getByRole("heading", { name: /Locked/ })).toBeVisible();
	const refused = (await replay()).filter((c) => c.status === 403);
	expect(refused.length).toBeGreaterThan(0);
	const overviewUrl = refused[0]!.url;

	for (const path of ["/dashboard", "/settings"]) {
		await page.goto(path, { waitUntil: "networkidle" });
		await expect(page.getByRole("heading", { name: /Locked/ })).toBeVisible();
	}

	await page.getByRole("link", { name: "Go to missions" }).click();
	await expect(page.getByTestId("student-name")).toContainText("Ava");
	const tabs = page.getByRole("navigation", { name: "Ava sections" });
	await expect(tabs.getByRole("link", { name: "Missions" })).toBeVisible();
	await expect(tabs.getByRole("link", { name: "Progress" })).toHaveCount(0);
	const progressUrl = [...calls].find((url) =>
		Buffer.from(url.split("/_serverFn/")[1] ?? "", "base64url")
			.toString()
			.includes("getProgressFn"),
	);
	expect(progressUrl).toBeDefined();
	const lockedProgress = await (await page.request.get(progressUrl as string)).text();
	expect(lockedProgress).toContain("Ava");
	expect(lockedProgress).not.toContain("computedStatus");

	const missionsUrl = page.url();
	await page.goto(`${missionsUrl}/progress`, { waitUntil: "networkidle" });
	await expect(page.getByRole("heading", { name: /Locked/ })).toBeVisible();

	await page.getByLabel("PIN", { exact: true }).fill("1111");
	await page.getByRole("button", { name: "Unlock" }).click();
	await expect(page.getByRole("alert")).toHaveText("Incorrect PIN.");

	await page.getByLabel("PIN", { exact: true }).fill("4826");
	await page.getByRole("button", { name: "Unlock" }).click();
	await expect(page).toHaveURL(/\/progress$/);
	expect((await page.request.get(overviewUrl)).status()).toBe(200);
	expect(await (await page.request.get(progressUrl as string)).text()).toContain("computedStatus");
});

test("PIN guesses are rate limited and the PIN resets with the account password", async ({ page }) => {
	await signUp(page, `pin-reset-${Date.now()}@example.test`);
	await setPin(page, "4826");
	await lock(page);
	await expect(page.getByRole("heading", { name: /Locked/ })).toBeVisible();

	const pin = page.getByLabel("PIN", { exact: true });
	for (let i = 0; i < 8; i += 1) {
		await pin.fill(String(1000 + i));
		await page.getByRole("button", { name: "Unlock" }).click();
		await expect(page.getByRole("alert")).toHaveText("Incorrect PIN.");
		await expect(page.getByRole("button", { name: "Unlock" })).toBeEnabled();
	}
	await pin.fill("4826");
	await page.getByRole("button", { name: "Unlock" }).click();
	await expect(page.getByRole("alert")).toHaveText(/Too many requests/);

	await page.getByRole("button", { name: "Forgot the PIN?" }).click();
	await page.getByLabel("Account password").fill("not-the-password");
	await page.getByLabel(/New parent PIN/).fill("1357");
	await page.getByLabel("Repeat the PIN").fill("1357");
	await page.getByRole("button", { name: "Reset PIN" }).click();
	await expect(page.getByRole("alert")).toHaveText("Incorrect account password.");

	await page.getByLabel("Account password").fill(PASSWORD);
	await page.getByLabel(/New parent PIN/).fill("1357");
	await page.getByLabel("Repeat the PIN").fill("1357");
	await page.getByRole("button", { name: "Reset PIN" }).click();
	await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
	await expect(page.getByRole("button", { name: "Lock now" })).toBeVisible();
});

test("programme controls are refused once the parent area locks", async ({ page }) => {
	await signUp(page, `pin-controls-${Date.now()}@example.test`);
	await addLearner(page, "Rae", "3");
	await setPin(page, "4826");
	await page.goto("/dashboard", { waitUntil: "networkidle" });
	await page.getByRole("link", { name: "Open Rae" }).click();
	await page.getByRole("link", { name: "Progress", exact: true }).click();
	const controls = page.getByTestId("programme-controls");
	await expect(controls).toBeVisible();

	const writes: { url: string; body: string; headers: Record<string, string> }[] = [];
	page.on("request", (r) => {
		if (!r.url().includes("/_serverFn/") || r.method() !== "POST") return;
		const { cookie: _c, host: _h, "content-length": _l, ...headers } = r.headers();
		writes.push({ url: r.url(), body: r.postData() ?? "", headers });
	});
	await controls.getByRole("button", { name: "Pause the course" }).click();
	await expect(controls).toHaveAttribute("data-paused", "true");
	await controls.getByRole("button", { name: "Resume the course" }).click();
	await expect(controls).toHaveAttribute("data-paused", "false");
	const skip = controls.getByTestId("control-skip");
	await skip.getByRole("textbox").fill("Covered at school");
	await skip.getByRole("button", { name: "Skip this step" }).click();
	await expect(page.getByRole("button", { name: /^Undo skip/ })).toBeVisible();
	await page.getByRole("button", { name: /^Undo skip/ }).click();
	await expect(page.getByRole("button", { name: /^Undo skip/ })).toHaveCount(0);
	const known = controls.getByTestId("control-known");
	await known.getByRole("textbox").fill("Already secure at school");
	await known.getByRole("button", { name: "Already known" }).click();
	await expect(page.getByTestId("report-position")).toBeVisible();

	const name = (url: string) =>
		JSON.parse(Buffer.from(url.split("/_serverFn/")[1] ?? "", "base64url").toString()).export as string;
	const fns = new Set(writes.map((w) => name(w.url).replace(/_createServerFn_handler$/, "")));
	expect([...fns]).toEqual(
		expect.arrayContaining([
			"setProgrammePausedFn",
			"skipProgrammeStepFn",
			"undoProgrammeSkipFn",
			"overrideCompetencyFn",
		]),
	);

	await lock(page);
	await expect(page.getByRole("heading", { name: /Locked/ })).toBeVisible();
	for (const w of writes.filter((x) => !/lockParentFn|unlockParentFn/.test(name(x.url)))) {
		const res = await page.request.post(w.url, { data: w.body, headers: w.headers });
		expect(res.status(), name(w.url)).toBe(403);
	}
});
