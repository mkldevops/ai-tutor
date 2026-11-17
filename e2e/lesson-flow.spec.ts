import { expect, type Page, test } from "@playwright/test";
import { normalise, solve } from "./solver";

async function signUp(page: Page, email: string) {
	await page.goto("/signup", { waitUntil: "networkidle" });
	await page.getByLabel("Your name").fill("Parent");
	await page.getByLabel(/Family name/).fill("Test family");
	await page.getByLabel("Email").fill(email);
	await page.getByLabel(/Password/).fill("correct-horse-battery");
	await page.getByRole("button", { name: "Create account" }).click();
	await expect(page.getByRole("heading", { name: "Your learners" })).toBeVisible();
}

async function addLearner(page: Page, name: string, year: "3" | "5") {
	await page.getByRole("button", { name: "Add a learner" }).click();
	await page.getByLabel("Display name").fill(name);
	await page.getByLabel("Year group").selectOption(year);
	await page.getByRole("button", { name: "Add learner" }).click();
	await expect(page.getByRole("link", { name: `Open ${name}` })).toBeVisible();
}

async function answerCurrent(page: Page, wrong = false) {
	const prompt = (await page.getByTestId("prompt").innerText()).trim();
	const answer = wrong ? "999999" : solve(prompt);
	const choices = page.getByTestId("question").getByTestId("choice");
	if ((await choices.count()) > 0) {
		const texts = await choices.allInnerTexts();
		const idx = wrong
			? texts.findIndex((t) => normalise(t) !== solve(prompt))
			: texts.findIndex((t) => normalise(t) === answer);
		expect(idx, `choice for ${prompt}`).toBeGreaterThanOrEqual(0);
		await choices.nth(idx).click();
	} else {
		await page.getByLabel("Your answer").fill(answer);
		await page.getByRole("button", { name: "Check" }).click();
	}
}

async function completeLesson(page: Page, { wrongInGuided = 0 } = {}) {
	let wrongLeft = wrongInGuided;
	for (let step = 0; step < 60; step++) {
		const phase = await page.getByTestId("phase").getAttribute("data-phase");
		if (phase === "complete") return;
		if (phase === "instruction") {
			await expect(page.getByTestId("explanation")).toBeVisible();
			const ready = page.getByRole("button", { name: "I'm ready to practise" });
			while (!(await ready.isVisible())) await page.getByRole("button", { name: "Next" }).click();
			await ready.click();
			await expect(page.getByTestId("phase")).not.toHaveAttribute("data-phase", "instruction");
			continue;
		}
		const position = (await page.getByTestId("phase").textContent()) ?? "";
		const wrong = phase === "guided" && wrongLeft > 0;
		if (wrong) wrongLeft--;
		await answerCurrent(page, wrong);
		await expect(page.getByTestId("phase")).not.toHaveText(position);
		if (phase !== "guided") continue;
		const feedback = page.getByTestId("feedback");
		await expect(feedback).toHaveAttribute("data-correct", String(!wrong));
		await expect(page.getByTestId("question")).toHaveCount(0);
		if (wrong) {
			await expect(feedback.getByTestId("correct-answer")).toBeVisible();
			await page.waitForTimeout(2500);
			await expect(page.getByTestId("question")).toHaveCount(0);
			await feedback.getByTestId("understood").click();
		}
		await expect(feedback).toHaveCount(0);
	}
	throw new Error("Lesson did not complete");
}

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
	const avaHistory = page.getByTestId("history-MA-Y3-AS-MENTAL");
	await expect(avaHistory.getByRole("list", { name: "Answers per week" }).getByRole("listitem")).toHaveCount(6);
	await expect(avaHistory.getByRole("list", { name: "Status history" })).toContainText("secure");
	await expect(page.getByTestId("history-MA-Y3-MD-TABLES-348")).toHaveCount(0);

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
