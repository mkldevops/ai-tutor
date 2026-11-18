import { expect, test } from "@playwright/test";
import { addLearner, completeLesson, signUp } from "./lesson-helpers";

test("a Year 3 learner completes an English lesson, kept apart from Maths and from other families", async ({
	page,
	browser,
}) => {
	await signUp(page, `parent-en-${Date.now()}@example.test`);
	await addLearner(page, "Cleo", "3");
	await page.getByRole("link", { name: "Open Cleo" }).click();
	const cleoUrl = page.url();

	const maths = page.getByRole("tab", { name: /Maths/ });
	const english = page.getByRole("tab", { name: /English/ });
	await expect(maths).toHaveAttribute("aria-selected", "true");
	await expect(page.getByTestId("objective-MA-Y3-AS-MENTAL")).toBeVisible();
	await expect(page.getByTestId("objective-EN-Y3-GR-PRESENT-PERFECT")).toHaveCount(0);

	await english.click();
	await expect(english).toHaveAttribute("aria-selected", "true");
	await expect(page.getByTestId("objective-MA-Y3-AS-MENTAL")).toHaveCount(0);
	await expect(page.getByTestId("objective-EN-Y5-GR-RELATIVE-CLAUSES")).toHaveCount(0);
	const objective = page.getByTestId("objective-EN-Y3-GR-PRESENT-PERFECT");
	await expect(objective.getByTestId("status-badge")).toHaveAttribute("data-status", "not_started");
	await objective.getByRole("button", { name: "Start lesson" }).click();
	await expect(page.getByTestId("phase")).toHaveAttribute("data-phase", "diagnostic");
	await completeLesson(page, { wrongInGuided: 1 });

	const result = page.getByTestId("result");
	await expect(result.getByTestId("status-badge")).toHaveAttribute("data-status", "secure");
	await result.getByRole("link", { name: "Back to progress" }).click();
	await expect(english).toHaveAttribute("aria-selected", "true");
	await expect(english).toContainText("1/3");
	await expect(objective.getByTestId("status-badge")).toHaveAttribute("data-status", "secure");
	await maths.click();
	await expect(page.getByTestId("objective-MA-Y3-AS-MENTAL").getByTestId("status-badge")).toHaveAttribute(
		"data-status",
		"not_started",
	);

	await page.getByRole("link", { name: "Progress", exact: true }).click();
	await expect(page.getByTestId("subject-progress-english")).toContainText("1 / 3 secured");
	await expect(page.getByTestId("subject-progress-maths")).toContainText(/0 \/ \d+ secured/);

	const other = await browser.newContext();
	const otherPage = await other.newPage();
	await signUp(otherPage, `other-en-${Date.now()}@example.test`);
	await otherPage.goto(cleoUrl, { waitUntil: "networkidle" });
	await expect(otherPage.getByText(/not found/i)).toBeVisible();
	await expect(otherPage.getByTestId("objective-EN-Y3-GR-PRESENT-PERFECT")).toHaveCount(0);
	await other.close();
});
