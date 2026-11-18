import { expect, test } from "@playwright/test";
import { addLearner, completeLesson, signUp } from "./lesson-helpers";

test("two learners complete separate lessons with isolated progress", async ({ page, browser }) => {
	const email = `parent-${Date.now()}@example.test`;
	await signUp(page, email);
	await addLearner(page, "Ava", "3");
	await addLearner(page, "Ben", "5");

	await page.getByRole("link", { name: "Open Ava" }).click();
	await expect(page.getByTestId("student-name")).toContainText("Year 3");
	const avaUrl = page.url();
	const avaObjective = page.getByTestId("objective-MA-Y3-AS-MENTAL");
	await expect(avaObjective.getByTestId("status-badge")).toHaveAttribute("data-status", "not_started");
	await avaObjective.getByRole("button", { name: "Start lesson" }).click();
	await expect(page.getByTestId("phase")).toHaveAttribute("data-phase", "diagnostic");
	await expect(page.getByTestId("flight-plan").locator('[aria-current="step"]')).toContainText("Recall");
	await page
		.getByTestId("confidence")
		.getByRole("button", { name: /^2 of 5/ })
		.click();
	await expect(page.getByTestId("confidence")).toHaveCount(0);
	await completeLesson(page, { wrongInGuided: 1 });

	const result = page.getByTestId("result");
	await result
		.getByTestId("confidence")
		.getByRole("button", { name: /^4 of 5/ })
		.click();
	const thanks = result.getByTestId("confidence-thanks");
	await expect(thanks).toContainText("Thanks for rating!");
	await expect(thanks.getByTestId("confidence-change")).toContainText("Before: 2 of 5 · Now: 4 of 5");
	await expect(thanks).toHaveCount(0, { timeout: 5000 });
	await expect(result.getByTestId("confidence")).toHaveCount(0);
	await expect(result.getByTestId("confidence-change")).toContainText("Before: 2 of 5 · Now: 4 of 5");
	await page.evaluate(() => localStorage.clear());
	await page.reload();
	await expect(page.getByTestId("result").getByTestId("confidence-change")).toContainText(
		"Before: 2 of 5 · Now: 4 of 5",
	);
	await expect(result.getByTestId("status-badge")).toHaveAttribute("data-status", "secure");
	await expect(result).toContainText(/review/i);
	await result.getByRole("link", { name: "Back to progress" }).click();
	await expect(avaObjective.getByTestId("status-badge")).toHaveAttribute("data-status", "secure");
	await expect(avaObjective.getByRole("button", { name: /Review due/ })).toBeDisabled();
	await expect(page.getByTestId("objective-MA-Y3-MD-TABLES-348")).toBeVisible();

	await page.getByRole("link", { name: "Progress", exact: true }).click();
	await page.getByTestId("evidence-MA-Y3-AS-MENTAL").getByText("Details", { exact: true }).click();
	const avaHistory = page.getByTestId("history-MA-Y3-AS-MENTAL");
	await expect(avaHistory.getByRole("list", { name: "Answers per week" }).getByRole("listitem")).toHaveCount(6);
	await expect(avaHistory.getByRole("list", { name: "Status history" })).toContainText("Secure");
	await expect(page.getByTestId("history-MA-Y3-MD-TABLES-348")).toHaveCount(0);
	await expect(page.getByTestId("outcomes-retention")).toContainText("No review done yet");
	await expect(page.getByTestId("outcomes-confidence")).toContainText("1 of 1 matched");
	await page.getByText("See each check-in", { exact: true }).click();
	await expect(page.getByRole("list", { name: "Confidence check-ins" })).toContainText("felt 4 of 5");

	await page.getByRole("link", { name: "← All learners" }).click();
	const avaCard = page.getByTestId("learner-Ava");
	await expect(avaCard.getByTestId("overview-secure")).toContainText(/^1/);
	await expect(avaCard.getByTestId("overview-week")).not.toContainText(/^0 /);
	await expect(avaCard.getByTestId("overview-review")).toContainText("Next review");
	await expect(page.getByTestId("learner-Ben")).toContainText("No missions yet");
	await page.getByRole("link", { name: "Open Ben" }).click();
	await expect(page.getByTestId("student-name")).toContainText("Year 5");
	await expect(page.getByTestId("objective-MA-Y3-AS-MENTAL")).toHaveCount(0);
	const benObjective = page.getByTestId("objective-MA-Y5-MD-POWERS10");
	await expect(benObjective.getByTestId("status-badge")).toHaveAttribute("data-status", "not_started");
	await benObjective.getByRole("button", { name: "Start lesson" }).click();
	await completeLesson(page);
	await expect(page.getByTestId("result").getByTestId("status-badge")).toHaveAttribute("data-status", "secure");

	const other = await browser.newContext();
	const otherPage = await other.newPage();
	await signUp(otherPage, `other-${Date.now()}@example.test`);
	await expect(otherPage.getByRole("link", { name: "Open Ava" })).toHaveCount(0);
	await otherPage.goto(avaUrl, { waitUntil: "networkidle" });
	await expect(otherPage.getByText(/not found/i)).toBeVisible();
	await expect(otherPage.getByTestId("student-name")).toHaveCount(0);
	await other.close();
});
