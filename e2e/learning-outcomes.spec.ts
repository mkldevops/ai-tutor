import { expect, test } from "@playwright/test";
import { addLearner, completeLesson, placeOnStep, signUp, startMission } from "./lesson-helpers";

const CLIENT_IP = { "x-forwarded-for": "198.51.100.52" };
test.use({ extraHTTPHeaders: CLIENT_IP });

test("parent sees deterministic learning outcomes, other families and signed-out visitors do not", async ({
	page,
	browser,
}) => {
	await signUp(page, `outcomes-${Date.now()}@example.test`);
	await addLearner(page, "Ava", "3");
	await page.getByRole("link", { name: "Open Ava" }).click();
	const missionsUrl = page.url();

	await page.getByRole("link", { name: "Outcomes", exact: true }).click();
	await expect(page.getByTestId("outcomes-empty")).toContainText("Ava has no evidence yet");
	const outcomesUrl = page.url();
	expect(outcomesUrl).toMatch(/\/outcomes$/);

	await page.goto(missionsUrl, { waitUntil: "networkidle" });
	await placeOnStep(page, "MA-Y3-AS-MENTAL");
	await startMission(page, "MA-Y3-AS-MENTAL");
	await expect(page.getByTestId("phase")).toHaveAttribute("data-phase", "diagnostic");
	await completeLesson(page);
	await expect(page.getByTestId("result").getByTestId("status-badge")).toHaveAttribute("data-status", "secure");

	await page.goto(outcomesUrl, { waitUntil: "networkidle" });
	await expect(page.getByTestId("outcomes-pass-rate")).toContainText("No spaced review yet.");
	await expect(page.getByTestId("outcomes-regressions")).toContainText("0 times");
	await expect(page.getByTestId("outcomes-overdue")).toContainText("0");
	await expect(page.getByTestId("outcomes-secure-now")).toContainText("1 of 7 started");
	for (const n of [1, 2, 3]) await expect(page.getByTestId(`outcomes-retention-${n}`)).toContainText("None yet");
	await expect(page.getByTestId("outcomes-pass-rate")).not.toContainText("%");
	await expect(page.getByRole("list", { name: "Retention by review" })).not.toContainText("%");

	const card = page.getByTestId("outcome-MA-Y3-AS-MENTAL");
	await expect(card.getByTestId("status-badge")).toHaveAttribute("data-status", "secure");
	await expect(card.getByTestId("outcome-since")).toContainText("Secure for 0 days, not yet confirmed");
	await expect(card).toContainText("No spaced review yet.");
	await expect(card.getByTestId("outcome-next-review")).toContainText("Next review");
	await expect(card.getByTestId("outcome-overdue")).toHaveCount(0);

	await page.getByText("How these are counted", { exact: true }).click();
	await expect(page.getByTestId("outcomes-summary")).toContainText("secure for at least 7 days");

	const other = await browser.newContext({ extraHTTPHeaders: CLIENT_IP });
	const otherPage = await other.newPage();
	await signUp(otherPage, `outcomes-other-${Date.now()}@example.test`);
	await otherPage.goto(outcomesUrl, { waitUntil: "networkidle" });
	await expect(otherPage.getByText(/not found/i)).toBeVisible();
	await expect(otherPage.getByTestId("outcomes-summary")).toHaveCount(0);
	await expect(otherPage.getByTestId("outcome-MA-Y3-AS-MENTAL")).toHaveCount(0);
	await other.close();

	const anon = await browser.newContext({ extraHTTPHeaders: CLIENT_IP });
	const anonPage = await anon.newPage();
	await anonPage.goto(outcomesUrl, { waitUntil: "networkidle" });
	await expect(anonPage).toHaveURL(/\/login/);
	await expect(anonPage.getByTestId("outcomes-summary")).toHaveCount(0);
	await anon.close();
});
