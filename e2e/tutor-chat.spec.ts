import { expect, type Page, test } from "@playwright/test";
import { placeOnStep, startMission } from "./lesson-helpers";
import { normalise, solve } from "./solver";

test.use({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100.41" } });

async function answerCorrectly(page: Page) {
	const prompt = ((await page.getByTestId("prompt").getAttribute("data-prompt")) ?? "").trim();
	const answer = solve(prompt);
	const position = (await page.getByTestId("phase").textContent()) ?? "";
	const choices = page.getByTestId("question").getByTestId("choice");
	if ((await choices.count()) > 0) {
		const texts = await choices.allInnerTexts();
		await choices.nth(texts.findIndex((t) => normalise(t) === answer)).click();
	} else {
		await page.getByLabel("Your answer").fill(answer);
		await page.getByRole("button", { name: "Check" }).click();
	}
	await expect(page.getByTestId("phase")).not.toHaveText(position);
	if (await page.getByTestId("feedback").isVisible()) {
		await page.getByTestId("feedback").getByRole("button", { name: "Continue", exact: true }).click();
	}
	await expect(page.getByTestId("feedback")).toHaveCount(0);
	await expect(page.getByTestId("answer-saved")).toHaveCount(0);
}

async function advanceTo(page: Page, phase: string) {
	for (let step = 0; step < 40; step++) {
		const current = await page.getByTestId("phase").getAttribute("data-phase");
		if (current === phase) return;
		if (current === "instruction") {
			const ready = page.getByRole("button", { name: "I'm ready to practise" });
			while (!(await ready.isVisible())) await page.getByRole("button", { name: "Next" }).click();
			await ready.click();
			await expect(page.getByTestId("phase")).not.toHaveAttribute("data-phase", "instruction");
			continue;
		}
		await expect(page.getByTestId("question")).toBeVisible();
		await answerCorrectly(page);
	}
	throw new Error(`Never reached ${phase}`);
}

test("Nova chats during tutoring and stays silent during the check", async ({ page }) => {
	await page.goto("/signup", { waitUntil: "networkidle" });
	await page.getByLabel("Your name").fill("Parent");
	await page.getByLabel(/Family name/).fill("Test family");
	await page.getByLabel("Email").fill(`chat-${Date.now()}@example.test`);
	await page.getByLabel(/Password/).fill("correct-horse-battery");
	await page.getByRole("button", { name: "Create account" }).click();
	await expect(page.getByRole("heading", { name: "Your learners" })).toBeVisible();
	await page.getByRole("button", { name: "Add a learner" }).click();
	await page.getByLabel("Display name").fill("QA Test");
	await page.getByLabel("Year group").selectOption("3");
	await page.getByRole("button", { name: "Add learner" }).click();
	await page.getByRole("link", { name: "Open QA Test" }).click();
	await placeOnStep(page, "MA-Y3-AS-MENTAL");
	await startMission(page, "MA-Y3-AS-MENTAL");

	await expect(page.getByTestId("phase")).toHaveAttribute("data-phase", "diagnostic");
	await page
		.getByTestId("confidence")
		.getByRole("button", { name: /^3 of 5/ })
		.click();
	await expect(page.getByTestId("tutor-chat")).toHaveCount(0);
	const sessionId = page.url().split("/learn/")[1]?.split(/[?#]/)[0] ?? "";

	await advanceTo(page, "instruction");
	const chat = page.getByTestId("tutor-chat");
	await expect(chat).toBeVisible();
	await chat.getByLabel("Message to Nova").fill("Why do we count on in tens?");
	await chat.getByRole("button", { name: "Send" }).click();
	await expect(chat.getByTestId("chat-child")).toHaveText("Why do we count on in tens?");
	await expect(chat.getByTestId("chat-nova")).toContainText("What did you notice about the tens digit?");

	await page.reload();
	await expect(page.getByTestId("tutor-chat").getByTestId("chat-nova")).toContainText("tens digit");
	await chat.getByLabel("Message to Nova").fill("Keep my draft");
	await chat.getByRole("button", { name: "Hide Nova · Continue alone" }).click();
	await expect(chat.getByLabel("Message to Nova")).toBeHidden();
	await expect(chat.getByRole("button", { name: "Open Nova" })).toHaveAttribute("aria-expanded", "false");
	await chat.getByRole("button", { name: "Open Nova" }).click();
	await expect(chat.getByLabel("Message to Nova")).toHaveValue("Keep my draft");
	await expect(chat.getByTestId("chat-nova")).toContainText("tens digit");

	// A deliberately slow UI stream tests cancellation; it does not test LLM pedagogy.
	await page.evaluate(() => {
		const original = window.fetch;
		window.fetch = async (input, init) => {
			if (!String(input).endsWith("/api/tutor-chat")) return original(input, init);
			const encoder = new TextEncoder();
			let timer: ReturnType<typeof setTimeout>;
			let stopped = false;
			const markStopped = () => {
				if (stopped) return;
				stopped = true;
				const root = document.documentElement;
				root.dataset.novaStopped = String(Number(root.dataset.novaStopped ?? "0") + 1);
			};
			const stream = new ReadableStream({
				start(controller) {
					const emit = (chunk: object) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
					emit({ type: "text-start", id: "slow" });
					emit({ type: "text-delta", id: "slow", delta: "A smaller example. " });
					timer = setTimeout(() => {
						emit({ type: "text-delta", id: "slow", delta: "This should never appear." });
						emit({ type: "text-end", id: "slow" });
						controller.close();
					}, 30_000);
					init?.signal?.addEventListener(
						"abort",
						() => {
							markStopped();
							clearTimeout(timer);
							controller.error(new DOMException("Aborted", "AbortError"));
						},
						{ once: true },
					);
				},
				cancel() {
					markStopped();
					clearTimeout(timer);
				},
			});
			return new Response(stream, {
				headers: { "content-type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1" },
			});
		};
	});
	await chat.getByRole("button", { name: "Use a smaller example", exact: true }).click();
	await expect(chat.getByTestId("chat-child").last()).toHaveText("Use a smaller example");
	await expect(chat.getByTestId("chat-nova").last()).toContainText("A smaller example.");
	await chat.getByRole("button", { name: "Stop generating", exact: true }).click();
	await expect(chat.getByRole("button", { name: "Stop generating", exact: true })).toHaveCount(0);
	await expect(chat.getByLabel("Message to Nova")).toBeFocused();
	await expect(chat.getByLabel("Message to Nova")).toHaveValue("Keep my draft");
	await chat.getByRole("button", { name: "Explain another way", exact: true }).click();
	await expect(chat.getByTestId("chat-nova").last()).toContainText("A smaller example.");
	await chat.getByRole("button", { name: "Hide Nova · Continue alone" }).click();
	await expect(chat.getByTestId("tutor-chat-log")).toBeHidden();
	await chat.getByRole("button", { name: "Open Nova" }).click();
	await expect(chat.getByRole("button", { name: "Stop generating", exact: true })).toHaveCount(0);
	await expect(chat.getByTestId("tutor-chat-log")).not.toContainText("This should never appear");
	await expect(chat.getByLabel("Message to Nova")).toHaveValue("Keep my draft");
	await expect(page.locator("html")).toHaveAttribute("data-nova-stopped", "2");

	await advanceTo(page, "guided");
	await expect(page.getByTestId("tutor-chat")).toBeVisible();
	const currentPrompt = await page.getByTestId("prompt").getAttribute("data-prompt");
	await expect(chat.getByTestId("tutor-current-question")).toHaveText(`Current question: ${currentPrompt}`);
	await chat.getByRole("button", { name: "Explain the question", exact: true }).click();
	await expect(chat.getByTestId("chat-nova")).toHaveCount(1);
	await expect(chat.getByTestId("chat-nova")).toContainText("A smaller example.");
	await answerCorrectly(page);
	await expect(page.locator("html")).toHaveAttribute("data-nova-stopped", "3");
	const nextPrompt = await page.getByTestId("prompt").getAttribute("data-prompt");
	await expect(chat.getByTestId("tutor-current-question")).toHaveText(`Current question: ${nextPrompt}`);
	await expect(chat.getByRole("button", { name: "Stop generating", exact: true })).toHaveCount(0);
	await expect(chat.getByRole("button", { name: "Explain the question", exact: true })).toBeEnabled();
	await expect(chat.getByTestId("chat-nova")).toHaveCount(0);
	await chat.getByRole("button", { name: "Hide Nova · Continue alone" }).click();
	await page.reload();
	await expect(chat.getByRole("button", { name: "Open Nova" })).toHaveAttribute("aria-expanded", "false");
	await expect(chat.getByTestId("chat-nova")).toHaveCount(0);

	await advanceTo(page, "independent");
	await expect(page.getByTestId("tutor-chat")).toHaveCount(0);
	const res = await page.request.post("/api/tutor-chat", {
		data: { sessionId, message: "What is the answer?" },
		headers: { "content-type": "application/json" },
	});
	expect(res.status()).toBe(403);
	expect(await res.text()).toContain("can't help during a check");
});
