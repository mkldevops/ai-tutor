import { expect, type Page } from "@playwright/test";
import { solveEnglish } from "./english-solver";
import { normalise, solve } from "./solver";

export async function signUp(page: Page, email: string) {
	await page.goto("/signup", { waitUntil: "networkidle" });
	await page.getByLabel("Your name").fill("Parent");
	await page.getByLabel(/Family name/).fill("Test family");
	await page.getByLabel("Email").fill(email);
	await page.getByLabel(/Password/).fill("correct-horse-battery");
	await page.getByRole("button", { name: "Create account" }).click();
	await expect(page.getByRole("heading", { name: "Your learners" })).toBeVisible();
}

export async function addLearner(page: Page, name: string, year: "3" | "5") {
	await page.getByRole("button", { name: "Add a learner" }).click();
	await page.getByLabel("Display name").fill(name);
	await page.getByLabel("Year group").selectOption(year);
	await page.getByRole("button", { name: "Add learner" }).click();
	await expect(page.getByRole("link", { name: `Open ${name}` })).toBeVisible();
}

export async function answerCurrent(page: Page, wrong = false) {
	const prompt = ((await page.getByTestId("prompt").getAttribute("data-prompt")) ?? "").trim();
	const choices = page.getByTestId("question").getByTestId("choice");
	const texts = (await choices.allInnerTexts()).map((t) => t.trim());
	const english = solveEnglish(prompt, texts);
	const right = english ?? solve(prompt);
	const answer = wrong ? "999999" : right;
	const matches = (t: string) => (english === null ? normalise(t) === right : t === right);
	if (texts.length > 0) {
		const idx = wrong ? texts.findIndex((t) => !matches(t)) : texts.findIndex(matches);
		expect(idx, `choice for ${prompt}`).toBeGreaterThanOrEqual(0);
		await expect(choices.first()).toBeFocused();
		for (let i = 0; i < idx; i++) await page.keyboard.press("ArrowRight");
		await expect(choices.nth(idx)).toBeFocused();
		await page.keyboard.press("Enter");
	} else {
		await page.getByLabel("Your answer").fill(answer);
		await page.getByRole("button", { name: "Check" }).click();
	}
}

export async function completeLesson(page: Page, { wrongInGuided = 0 } = {}) {
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
			await expect(page.getByTestId("explanation")).toHaveCount(0);
			continue;
		}
		const position = (await page.getByTestId("phase").textContent()) ?? "";
		const wrong = phase === "guided" && wrongLeft > 0;
		if (wrong) wrongLeft--;
		await answerCurrent(page, wrong);
		await expect(page.getByTestId("phase")).not.toHaveText(position);
		if (phase !== "guided") {
			const next = await page.getByTestId("phase").getAttribute("data-phase");
			if (next === phase) await expect(page.getByTestId("answer-saved")).toBeVisible();
			continue;
		}
		const feedback = page.getByTestId("feedback");
		await expect(feedback).toHaveAttribute("data-correct", String(!wrong));
		await expect(page.getByTestId("question")).toHaveCount(0);
		if (wrong) {
			await expect(feedback.getByTestId("correct-answer")).toBeVisible();
			await page.waitForTimeout(2500);
			await expect(page.getByTestId("question")).toHaveCount(0);
			await expect(feedback.getByTestId("understood")).toBeFocused();
			await page.keyboard.press("Enter");
		}
		await expect(feedback).toHaveCount(0);
	}
	throw new Error("Lesson did not complete");
}
