import { expect, test } from "@playwright/test";
import { addLearner, signUp } from "./lesson-helpers";

test.use({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100.57" } });

test("parent deletes one learner, then the whole family and account", async ({ page }) => {
	const email = `delete-${Date.now()}@example.test`;
	await signUp(page, email);
	await addLearner(page, "Sam", "3");
	await addLearner(page, "Ada", "5");

	await page.getByRole("button", { name: "Account menu" }).click();
	await page.getByRole("menuitem", { name: "Settings" }).click();
	await page.getByRole("listitem").filter({ hasText: "Sam" }).getByRole("link", { name: "Open settings" }).click();

	const deleteLearner = page.getByRole("button", { name: "Delete learner" });
	await expect(deleteLearner).toBeDisabled();
	await page.getByLabel("Confirm learner name").fill("sam");
	await expect(deleteLearner).toBeDisabled();
	await page.getByLabel("Confirm learner name").fill("Sam");
	await deleteLearner.click();
	await expect(page.getByRole("heading", { name: "Your learners" })).toBeVisible();
	await expect(page.getByRole("link", { name: "Open Sam" })).toHaveCount(0);
	await expect(page.getByRole("link", { name: "Open Ada" })).toBeVisible();

	await page.getByRole("button", { name: "Account menu" }).click();
	await page.getByRole("menuitem", { name: "Settings" }).click();
	await expect(page.getByRole("heading", { name: "Delete family and account" })).toBeVisible();
	const deleteAll = page.getByRole("button", { name: "Delete everything" });
	await expect(deleteAll).toBeDisabled();
	await page.getByLabel("Confirm account email").fill("someone-else@example.test");
	await expect(deleteAll).toBeDisabled();
	await page.getByLabel("Confirm account email").fill(email);
	await deleteAll.click();
	await expect(page).toHaveURL(/\/$/);

	await page.goto("/dashboard", { waitUntil: "networkidle" });
	await expect(page).toHaveURL(/\/login/);
	await page.getByLabel("Email").fill(email);
	await page.getByLabel("Password").fill("correct-horse-battery");
	await page.getByRole("button", { name: "Sign in" }).click();
	await expect(page.getByRole("alert")).toContainText("Invalid email or password");
});
