import { expect, type Page, test } from "@playwright/test";
import { programmeSteps } from "../src/curriculum/programme";
import { addLearner, completeLesson, placeOnStep, signUp, startMission } from "./lesson-helpers";

test.use({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100.66" } });

const STEPS = programmeSteps(3).map((s) => s.objectiveCode);
const FIRST = "MA-Y3-AS-MENTAL";
const SECOND = "MA-Y3-AS-COLUMN";

async function openProgress(page: Page) {
	await page.getByRole("link", { name: "Progress", exact: true }).click();
	await expect(page.getByTestId("programme-report")).toBeVisible();
}

test("the parent report shows where the learner is and moves after a secured mission", async ({ page }) => {
	await signUp(page, `parent-report-${Date.now()}@example.test`);
	await addLearner(page, "Noor", "3");
	await page.getByRole("link", { name: "Open Noor" }).click();
	const missions = page.url();

	await openProgress(page);
	const position = page.getByTestId("report-position");
	await expect(position).toHaveAttribute("data-step", STEPS[0] as string);
	await expect(position).toContainText(`Noor is on unit 1 of`);
	await expect(page.getByTestId("report-secured")).toContainText(`0 of ${STEPS.length} steps secured`);
	await expect(page.getByTestId("report-secured")).toContainText("No mission done yet.");
	await expect(page.getByTestId("report-acquired")).toContainText("Nothing secured yet.");
	await expect(page.getByTestId("report-rework")).toContainText("Nothing to rework.");
	await expect(page.getByTestId("report-next").getByRole("listitem")).toHaveCount(3);
	const firstLink = page.getByTestId(`next-${STEPS[0]}`).getByRole("link");
	await expect(firstLink).toHaveAttribute("href", `#evidence-${STEPS[0]}`);
	for (const code of STEPS) await expect(page.locator(`[id="evidence-${code}"]`)).toHaveCount(1);

	await page.goto(missions, { waitUntil: "networkidle" });
	await placeOnStep(page, FIRST);
	await openProgress(page);
	await expect(position).toHaveAttribute("data-step", FIRST);
	await expect(page.getByTestId(`acquired-${STEPS[0]}`)).toBeVisible();
	await page.goto(missions, { waitUntil: "networkidle" });

	await startMission(page, FIRST);
	await completeLesson(page);
	await page.getByTestId("result").getByRole("link", { name: "Back to course" }).click();
	await expect(page.getByTestId(`step-${FIRST}`)).toHaveAttribute("data-state", "done");

	await openProgress(page);
	await expect(position).toHaveAttribute("data-step", SECOND);
	await expect(page.getByTestId("report-secured")).toContainText("1 mission in the last 7 days");
	await page.getByTestId(`acquired-${FIRST}`).getByRole("link").click();
	await expect(page).toHaveURL(new RegExp(`#evidence-${FIRST}$`));
	await expect(page.getByTestId(`evidence-${FIRST}`)).toBeInViewport();
});
