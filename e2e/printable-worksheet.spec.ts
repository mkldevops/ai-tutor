import { expect, test } from "@playwright/test";

test("parent prints a worksheet and a separate answer key", async ({ page }) => {
	await page.goto("/signup", { waitUntil: "networkidle" });
	await page.getByLabel("Your name").fill("Parent");
	await page.getByLabel(/Family name/).fill("Print family");
	await page.getByLabel("Email").fill(`print-${Date.now()}@example.test`);
	await page.getByLabel(/Password/).fill("correct-horse-battery");
	await page.getByRole("button", { name: "Create account" }).click();
	await page.getByRole("button", { name: "Add a learner" }).click();
	await page.getByLabel("Display name").fill("Robin");
	await page.getByLabel("Year group").selectOption("5");
	await page.getByRole("button", { name: "Add learner" }).click();
	await page.getByRole("link", { name: "Open Robin" }).click();
	await page.getByRole("link", { name: "Worksheets" }).click();

	const card = page.getByTestId("printable-worksheets");
	await card.getByLabel("Number of questions").selectOption("6");
	await card.getByRole("button", { name: "Make worksheet" }).click();

	await expect(page.getByRole("heading", { name: "Maths practice" })).toBeVisible();
	await expect(page.getByText("Robin", { exact: true })).toBeVisible();
	await expect(page.locator("article ol > li")).toHaveCount(6);
	await expect(page.getByText(/Answer: \d/)).toHaveCount(0);
	await expect(page.getByTestId("box-working")).toHaveCount(6);
	const mcq = await page.locator("article ol > li:has(ul)").count();
	await expect(page.getByTestId("box-answer")).toHaveCount(6 - mcq);
	const questions = await page.locator("article ol > li").allInnerTexts();
	await page.screenshot({ path: "test-results/printable-worksheet.png", fullPage: true });

	await page.getByRole("link", { name: "Show answer key" }).click();
	await expect(page.getByRole("heading", { name: "Answer key" })).toBeVisible();
	await expect(page.locator("article ol > li")).toHaveCount(6);
	await expect(page.locator("article ol > li").first()).toContainText(/Answer: \d/);
	await page.screenshot({ path: "test-results/printable-key.png", fullPage: true });

	await page.getByRole("link", { name: "Show worksheet" }).click();
	await expect(page.getByRole("heading", { name: "Maths practice" })).toBeVisible();
	expect(await page.locator("article ol > li").allInnerTexts()).toEqual(questions);

	await page.emulateMedia({ media: "print" });
	await expect(page.getByRole("button", { name: "Print or save as PDF" })).toBeHidden();
	await expect(page.getByRole("button", { name: "Account menu" })).toBeHidden();
	await expect(page.getByRole("heading", { name: "Maths practice" })).toBeVisible();
});
