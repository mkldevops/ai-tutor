import { expect, type Page, test } from "@playwright/test";
import { normalise, solve } from "./solver";

test.use({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100.7" } });

type VoiceWindow = Window & { __spoken: string[]; __say: string; __mode: string };

async function fakeSpeech(page: Page, mode: "available" | "unavailable" | "downloadable") {
	await page.addInitScript((initial) => {
		const w = window as unknown as VoiceWindow & Record<string, unknown>;
		w.__spoken = [];
		w.__say = "";
		w.__mode = initial;
		Object.defineProperty(window, "speechSynthesis", {
			configurable: true,
			value: {
				speak: (u: { text: string }) => w.__spoken.push(u.text),
				cancel: () => {},
				getVoices: () => [],
			},
		});
		w.SpeechSynthesisUtterance = class {
			text: string;
			lang = "";
			rate = 1;
			voice = null;
			constructor(text: string) {
				this.text = text;
			}
		};
		class FakeRecognition {
			static available = async () => w.__mode;
			static install = async () => {
				w.__mode = "available";
				return true;
			};
			lang = "";
			processLocally = false;
			interimResults = false;
			maxAlternatives = 1;
			onresult: ((e: unknown) => void) | null = null;
			onerror: ((e: unknown) => void) | null = null;
			onend: (() => void) | null = null;
			start() {
				if (!this.processLocally) throw new Error("must run on device");
				setTimeout(() => {
					this.onresult?.({ results: [[{ transcript: "um" }, { transcript: w.__say }]] });
					this.onend?.();
				}, 50);
			}
			abort() {
				this.onend?.();
			}
		}
		w.SpeechRecognition = FakeRecognition;
		delete w.webkitSpeechRecognition;
	}, mode);
}

async function startVoiceLesson(page: Page, family: string) {
	await page.goto("/signup", { waitUntil: "networkidle" });
	await page.getByLabel("Your name").fill("Parent");
	await page.getByLabel(/Family name/).fill(family);
	await page.getByLabel("Email").fill(`${family.toLowerCase().replace(/\s/g, "-")}-${Date.now()}@example.test`);
	await page.getByLabel(/Password/).fill("correct-horse-battery");
	await page.getByRole("button", { name: "Create account" }).click();
	await page.getByRole("button", { name: "Add a learner" }).click();
	await page.getByLabel("Display name").fill("Mia");
	await page.getByLabel("Year group").selectOption("3");
	await page.getByRole("button", { name: "Add learner" }).click();
	await page.getByRole("link", { name: "Open Mia" }).click();
	await page.getByRole("link", { name: "Settings" }).click();

	const settings = page.getByTestId("voice-settings");
	await expect(settings.getByLabel("Use voice in lessons")).not.toBeChecked();
	await settings.getByLabel("Use voice in lessons").check();
	await expect(settings.getByLabel("Use voice in lessons")).toBeChecked();
	await page.reload({ waitUntil: "networkidle" });
	await expect(page.getByTestId("voice-settings").getByLabel("Use voice in lessons")).toBeChecked();
	const settingsUrl = page.url();
	await page.getByRole("link", { name: "Missions" }).click();

	await page.getByTestId("objective-MA-Y3-AS-MENTAL").getByRole("button", { name: "Start lesson" }).click();
	await expect(page.getByTestId("phase")).toHaveAttribute("data-phase", "diagnostic");
	await page
		.getByTestId("confidence")
		.getByRole("button", { name: /^3 of 5/ })
		.click();
	return settingsUrl;
}

async function untilTypedQuestion(page: Page) {
	for (let step = 0; step < 20; step++) {
		if ((await page.getByTestId("phase").getAttribute("data-phase")) === "instruction") {
			const ready = page.getByRole("button", { name: "I'm ready to practise" });
			while (!(await ready.isVisible())) await page.getByRole("button", { name: "Next" }).click();
			await ready.click();
			await expect(page.getByTestId("phase")).not.toHaveAttribute("data-phase", "instruction");
			continue;
		}
		await expect(page.getByTestId("question")).toBeVisible();
		if (await page.getByLabel("Your answer").isVisible()) return;
		const choices = page.getByTestId("question").getByTestId("choice");
		const prompt = ((await page.getByTestId("prompt").getAttribute("data-prompt")) ?? "").trim();
		const position = (await page.getByTestId("phase").textContent()) ?? "";
		const texts = await choices.allInnerTexts();
		await choices.nth(texts.findIndex((t) => normalise(t) === solve(prompt))).click();
		await expect(page.getByTestId("phase")).not.toHaveText(position);
	}
	throw new Error("No typed question reached");
}

test("a learner hears the question and says the answer on the device", async ({ page }) => {
	await fakeSpeech(page, "available");
	await startVoiceLesson(page, "Voice family");

	const prompt = ((await page.getByTestId("prompt").getAttribute("data-prompt")) ?? "").trim();
	await expect
		.poll(() => page.evaluate(() => (window as unknown as VoiceWindow).__spoken.at(-1)))
		.toContain(prompt.split(" ")[0]);
	expect(await page.evaluate(() => (window as unknown as VoiceWindow).__spoken.at(-1))).not.toMatch(/[×÷−☐]/);

	await untilTypedQuestion(page);
	const typedPrompt = ((await page.getByTestId("prompt").getAttribute("data-prompt")) ?? "").trim();
	const answer = solve(typedPrompt);
	await page.evaluate((a) => {
		(window as unknown as VoiceWindow).__say = `the answer is ${a}`;
	}, answer);
	await page.getByTestId("say-it").click();

	await expect(page.getByTestId("heard")).toContainText(`That is ${answer}.`);
	await expect(page.getByLabel("Your answer")).toHaveValue(answer);
	const position = (await page.getByTestId("phase").textContent()) ?? "";
	await page.getByRole("button", { name: "Check" }).click();
	await expect(page.getByTestId("phase")).not.toHaveText(position);
	await expect(page.getByTestId("heard")).toHaveCount(0);
	await page.screenshot({ path: "test-results/voice-pilot.png", fullPage: true });
});

test("without on-device recognition the learner types and still hears the question", async ({ page }) => {
	await fakeSpeech(page, "unavailable");
	await startVoiceLesson(page, "Typing family");
	await untilTypedQuestion(page);

	await expect(page.getByTestId("voice-unavailable")).toBeVisible();
	await expect(page.getByTestId("say-it")).toHaveCount(0);
	await expect(page.getByTestId("hear-again")).toBeVisible();

	const answer = solve(((await page.getByTestId("prompt").getAttribute("data-prompt")) ?? "").trim());
	await page.getByLabel("Your answer").fill(answer);
	const position = (await page.getByTestId("phase").textContent()) ?? "";
	await page.getByRole("button", { name: "Check" }).click();
	await expect(page.getByTestId("phase")).not.toHaveText(position);
});

test("the speech pack download stays with the parent, not in the lesson", async ({ page }) => {
	await fakeSpeech(page, "downloadable");
	const settingsUrl = await startVoiceLesson(page, "Pack family");
	await untilTypedQuestion(page);

	await expect(page.getByText(/speech pack/i)).toHaveCount(0);
	await expect(page.getByTestId("say-it")).toHaveCount(0);
	await expect(page.getByTestId("voice-unavailable")).toHaveCount(0);

	await page.goto(settingsUrl, { waitUntil: "networkidle" });
	const pack = page.getByTestId("speech-pack");
	await pack.getByRole("button", { name: "Download the speech pack" }).click();
	await expect(page.getByTestId("voice-settings")).toContainText("This device is ready for spoken answers.");
});
