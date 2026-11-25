import { expect, type Page, test } from "@playwright/test";
import { addLearner, answerCurrent, placeOnStep, signUp, startMission } from "./lesson-helpers";

test.use({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100.66" } });

async function expectNoTeaching(page: Page) {
	for (const id of ["concept-motion", "tutor-chat", "explanation", "hint"]) {
		await expect(page.getByTestId(id)).toHaveCount(0);
	}
	await expect(page.getByRole("button", { name: "Show a hint" })).toHaveCount(0);
}

test("lesson support stays optional, child-controlled and outside checks", async ({ page }) => {
	await signUp(page, `support-${Date.now()}@example.test`);
	await addLearner(page, "Alex", "5");
	await page.getByRole("link", { name: "Open Alex" }).click();
	await placeOnStep(page, "MA-Y5-MD-POWERS10");
	await startMission(page, "MA-Y5-MD-POWERS10");
	await expect(page).toHaveURL(/\/learn\//);
	const sessionUrl = page.url();
	await page
		.getByTestId("confidence")
		.getByRole("button", { name: /^3 of 5/ })
		.click();
	await expectNoTeaching(page);
	await expect(page.getByTestId("answer-format")).toBeVisible();
	const prompt = await page.getByTestId("prompt").getAttribute("data-prompt");
	await page.getByTestId("lesson-break").click();
	await page.getByRole("link", { name: "Resume mission" }).click();
	await expect(page).toHaveURL(sessionUrl);
	await expect(page.getByTestId("prompt")).toHaveAttribute("data-prompt", prompt ?? "");

	for (let n = 0; n < 12; n++) {
		if ((await page.getByTestId("phase").getAttribute("data-phase")) === "instruction") break;
		await expectNoTeaching(page);
		const position = await page.getByTestId("phase").textContent();
		await answerCurrent(page);
		await expect(page.getByTestId("phase")).not.toHaveText(position ?? "");
		await expect(page.getByTestId("answer-saved")).toHaveCount(0);
	}
	await expect(page.getByTestId("phase")).toHaveAttribute("data-phase", "instruction");
	const motion = page.getByTestId("concept-motion");
	await expect(motion).toBeVisible();
	await expect(page.getByTestId("explanation")).toContainText("Step 1 of");
	const timeline = motion.getByTestId("motion-timeline");
	const initialTime = await timeline.inputValue();
	await page.waitForTimeout(500);
	await expect(timeline).toHaveValue(initialTime);
	await motion.getByTestId("motion-play").click();
	await expect(timeline).not.toHaveValue(initialTime);
	await motion.getByTestId("motion-play").click();
	const pausedTime = await timeline.inputValue();
	await page.waitForTimeout(500);
	await expect(timeline).toHaveValue(pausedTime);
	// Starting practice never requires watching or reading every example.
	await page.getByRole("button", { name: "I'm ready to practise" }).click();
	await expect(page.getByTestId("phase")).toHaveAttribute("data-phase", "guided");
	await expect(page.getByTestId("concept-motion").getByTestId("motion-play")).not.toBeVisible();

	await answerCurrent(page, true);
	const feedback = page.getByTestId("feedback");
	await expect(feedback).toHaveAttribute("data-correct", "false");
	await expect(feedback.getByTestId("your-answer")).not.toHaveClass(/line-through/);
	await expect(feedback.getByRole("button", { name: "Continue", exact: true })).toBeFocused();
	await expect(page.getByTestId("question")).toHaveCount(0);
	await page.keyboard.press("Enter");
	await expect(feedback).toHaveCount(0);

	await answerCurrent(page);
	await expect(feedback).toHaveAttribute("data-correct", "true");
	await page.waitForTimeout(2200);
	await expect(feedback).toBeVisible();
	await expect(page.getByTestId("question")).toHaveCount(0);
	await page.keyboard.press("Enter");
	await expect(feedback).toHaveCount(0);

	for (let n = 0; n < 12; n++) {
		if ((await page.getByTestId("phase").getAttribute("data-phase")) === "independent") break;
		await answerCurrent(page);
		await feedback.getByRole("button", { name: "Continue", exact: true }).click();
	}
	await expect(page.getByTestId("phase")).toHaveAttribute("data-phase", "independent");
	await expectNoTeaching(page);
	await answerCurrent(page, true);
	await expect(page.getByTestId("answer-saved")).toBeVisible();
	await expect(feedback).toHaveCount(0);
	await expectNoTeaching(page);
});
