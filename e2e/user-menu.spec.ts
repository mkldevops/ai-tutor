import { expect, test } from "@playwright/test";

test.use({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100.23" } });

test("account menu links to settings, dashboard and sign out", async ({ page }) => {
	await page.goto("/signup", { waitUntil: "networkidle" });
	await page.getByLabel("Your name").fill("Menu Parent");
	await page.getByLabel(/Family name/).fill("Menu family");
	await page.getByLabel("Email").fill(`menu-${Date.now()}@example.test`);
	await page.getByLabel(/Password/).fill("correct-horse-battery");
	await page.getByRole("button", { name: "Create account" }).click();
	await page.getByLabel("Display name").fill("Sam");
	await page.getByRole("button", { name: "Add learner" }).click();

	const trigger = page.getByRole("button", { name: "Account menu" });
	await expect(page.getByRole("menu")).toBeHidden();
	await trigger.click();
	await expect(page.getByTestId("user-menu-name")).toHaveText("Menu Parent");
	await page.keyboard.press("Escape");
	await expect(page.getByRole("menu")).toBeHidden();
	await expect(trigger).toBeFocused();

	await trigger.click();
	await page.getByRole("menuitem", { name: "Settings" }).click();
	await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
	await expect(page.getByRole("menu")).toBeHidden();
	await page.getByRole("link", { name: "Open settings" }).click();
	await expect(page.getByTestId("student-name")).toContainText("Sam");

	await trigger.click();
	await page.getByRole("menuitem", { name: "Dashboard" }).click();
	await expect(page.getByRole("heading", { name: /learners/ })).toBeVisible();

	await trigger.click();
	await page.getByRole("menuitem", { name: "Sign out" }).click();
	await expect(page).toHaveURL(/\/login/);
});
