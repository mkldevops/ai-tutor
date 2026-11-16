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
