import { expect, test } from "@playwright/test";
import { addLearner, completeLesson, placeOnStep, signUp, startMission } from "./lesson-helpers";

const CLIENT_IP = { "x-forwarded-for": "198.51.100.31" };
test.use({ extraHTTPHeaders: CLIENT_IP });

test("a Year 3 learner completes an English lesson, kept apart from Maths and from other families", async ({
	page,
	browser,
}) => {
	await signUp(page, `parent-en-${Date.now()}@example.test`);
	await addLearner(page, "Cleo", "3");
	await page.getByRole("link", { name: "Open Cleo" }).click();
	const cleoUrl = page.url();
	await placeOnStep(page, "EN-Y3-GR-PRESENT-PERFECT");

	await expect(page.getByRole("tab")).toHaveCount(0);
	await expect(page.getByTestId("step-MA-Y3-AS-MENTAL")).toHaveAttribute("data-state", "locked");
	await expect(page.getByTestId("step-EN-Y5-GR-RELATIVE-CLAUSES")).toHaveCount(0);
	await startMission(page, "EN-Y3-GR-PRESENT-PERFECT");
	await expect(page.getByTestId("phase")).toHaveAttribute("data-phase", "diagnostic");
	await completeLesson(page, { wrongInGuided: 1 });

	await expect(page.getByTestId("explanation")).toHaveCount(0);
	const result = page.getByTestId("result");
	await expect(result.getByTestId("status-badge")).toHaveAttribute("data-status", "secure");
	await result.getByRole("link", { name: "Back to course" }).click();
	await expect(page.getByTestId("step-EN-Y3-GR-PRESENT-PERFECT")).toHaveAttribute("data-state", "done");
	await expect(page.getByTestId("step-MA-Y3-AS-MENTAL")).toHaveAttribute("data-state", "current");
	await expect(page.getByTestId("unit-transition")).toContainText(
		"Unit complete: Building sentences. Next: Maths · Addition and subtraction.",
	);
	await expect(page.getByTestId("step-MA-Y3-AS-MENTAL").getByTestId("status-badge")).toHaveCount(0);

	await page.getByRole("link", { name: "Progress", exact: true }).click();
	await expect(page.getByTestId("subject-progress-english")).toContainText("4 / 7 secured");
	await expect(page.getByTestId("subject-progress-maths")).toContainText(/2 \/ \d+ secured/);

	const other = await browser.newContext({ extraHTTPHeaders: CLIENT_IP });
	const otherPage = await other.newPage();
	await signUp(otherPage, `other-en-${Date.now()}@example.test`);
	await otherPage.goto(cleoUrl, { waitUntil: "networkidle" });
	await expect(otherPage.getByText(/not found/i)).toBeVisible();
	await expect(otherPage.getByTestId("step-EN-Y3-GR-PRESENT-PERFECT")).toHaveCount(0);
	await other.close();
});
