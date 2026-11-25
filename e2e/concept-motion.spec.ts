import { expect, test } from "@playwright/test";
import { addLearner, answerCurrent, placeOnStep, signUp, startMission } from "./lesson-helpers";

test.use({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100.67" } });

type NarrationWindow = Window & { __motionSpoken: string[]; __motionCancelled: number };

test("animated teaching fits mobile and connects optional voice without continuous motion", async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.addInitScript(() => {
		const state = window as unknown as NarrationWindow;
		state.__motionSpoken = [];
		state.__motionCancelled = 0;
		Object.defineProperty(window, "speechSynthesis", {
			configurable: true,
			value: {
				speak: (utterance: { text: string }) => state.__motionSpoken.push(utterance.text),
				cancel: () => state.__motionCancelled++,
				getVoices: () => [],
			},
		});
		Object.defineProperty(window, "SpeechSynthesisUtterance", {
			configurable: true,
			value: class {
				constructor(readonly text: string) {}
			},
		});
		// This scenario checks narration, not native speech-pack availability in headless Chrome.
		Object.defineProperty(window, "SpeechRecognition", {
			configurable: true,
			value: class {
				static available = async () => "unavailable";
				start() {
					throw new Error("Speech recognition is unavailable in this narration test.");
				}
			},
		});
	});
	await signUp(page, `motion-voice-${Date.now()}@example.test`);
	await addLearner(page, "Taylor", "5");
	await page.getByRole("link", { name: "Open Taylor" }).click();
	await page.getByRole("link", { name: "Settings", exact: true }).click();
	await page.getByLabel("Use voice in lessons").check();
	await page.getByRole("link", { name: "Missions", exact: true }).click();
	await placeOnStep(page, "MA-Y5-MD-POWERS10");
	await startMission(page, "MA-Y5-MD-POWERS10");
	await page
		.getByTestId("confidence")
		.getByRole("button", { name: /^3 of 5/ })
		.click();
	for (let n = 0; n < 12; n++) {
		if ((await page.getByTestId("phase").getAttribute("data-phase")) === "instruction") break;
		const position = await page.getByTestId("phase").textContent();
		await answerCurrent(page);
		await expect(page.getByTestId("phase")).not.toHaveText(position ?? "");
		await expect(page.getByTestId("answer-saved")).toHaveCount(0);
	}
	await expect(page.getByTestId("phase")).toHaveAttribute("data-phase", "instruction");
	const motion = page.getByTestId("concept-motion");
	const gentle = motion.getByRole("checkbox", { name: /Gentle motion/ });
	await expect(gentle).toBeChecked();
	await expect(gentle).toBeDisabled();
	await expect(motion.getByTestId("motion-narrate")).toBeVisible();
	await expect
		.poll(() => page.evaluate(() => (window as unknown as NarrationWindow).__motionSpoken.length))
		.toBeGreaterThan(0);

	await motion.getByTestId("motion-play").click();
	await expect(motion.getByTestId("motion-play")).toHaveText("Pause");
	await motion.getByTestId("motion-narrate").click();
	await expect(motion.getByTestId("motion-play")).toHaveText("Play");
	await expect
		.poll(() => page.evaluate(() => (window as unknown as NarrationWindow).__motionSpoken.at(-1)))
		.toContain("Each digit has a place and a value");
	const paused = await motion.getByTestId("motion-timeline").inputValue();
	await page.waitForTimeout(200);
	await expect(motion.getByTestId("motion-timeline")).toHaveValue(paused);
	const cancelled = await page.evaluate(() => (window as unknown as NarrationWindow).__motionCancelled);
	await motion.getByTestId("motion-stop-narration").click();
	await expect
		.poll(() => page.evaluate(() => (window as unknown as NarrationWindow).__motionCancelled))
		.toBeGreaterThan(cancelled);

	await motion.getByTestId("motion-example").selectOption({ label: "6 ÷ 1,000" });
	await motion.getByTestId("motion-timeline").focus();
	await page.keyboard.press("End");
	await expect(motion.getByTestId("motion-timeline")).toHaveValue("1000");
	await expect(motion.locator(".cm-caption")).toContainText("0.006");
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
	const svgFits = await motion.locator(".cm-stage").evaluate((stage) => {
		const svg = stage.querySelector("svg");
		return !!svg && svg.getBoundingClientRect().width <= stage.getBoundingClientRect().width + 1;
	});
	expect(svgFits).toBe(true);

	await page.getByRole("button", { name: "I'm ready to practise" }).click();
	await expect(page.getByTestId("phase")).toHaveAttribute("data-phase", "guided");
	await expect(page.getByTestId("motion-narrate")).not.toBeVisible();
	await page.getByRole("button", { name: "See an animated example" }).click();
	await expect(page.getByTestId("motion-narrate")).toBeVisible();
});
