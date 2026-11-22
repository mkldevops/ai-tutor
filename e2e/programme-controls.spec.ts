import { expect, type Page, test } from "@playwright/test";
import { programmeSteps } from "../src/curriculum/programme";
import { addLearner, signUp } from "./lesson-helpers";

test.use({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100.83" } });

const [FIRST, SECOND] = programmeSteps(3).map((s) => s.objectiveCode) as [string, string];

async function openTab(page: Page, name: "Progress" | "Missions") {
	await page.getByRole("link", { name, exact: true }).click();
	await expect(page.getByTestId(name === "Progress" ? "programme-controls" : "mission")).toBeVisible();
}

test("a parent pauses, skips and undoes a skip from the report", async ({ page }) => {
	await signUp(page, `parent-controls-${Date.now()}@example.test`);
	await addLearner(page, "Rae", "3");
	await page.getByRole("link", { name: "Open Rae" }).click();
	await openTab(page, "Progress");

	const controls = page.getByTestId("programme-controls");
	await controls.getByRole("button", { name: "Pause the course" }).click();
	await expect(controls).toHaveAttribute("data-paused", "true");
	await openTab(page, "Missions");
	await expect(page.getByTestId("mission")).toHaveAttribute("data-reason", "paused");
	await expect(page.getByTestId("mission-paused")).toContainText("paused");
	await expect(page.getByRole("button", { name: "Launch mission" })).toHaveCount(0);

	await openTab(page, "Progress");
	await controls.getByRole("button", { name: "Resume the course" }).click();
	await expect(controls).toHaveAttribute("data-paused", "false");

	const skip = controls.getByTestId("control-skip");
	await skip.getByRole("textbox").fill("Covered at school");
	await skip.getByRole("button", { name: "Skip this step" }).click();
	await expect(page.getByTestId("report-position")).toHaveAttribute("data-step", SECOND);
	await expect(page.getByTestId(`skipped-${FIRST}`)).toContainText("Covered at school");
	await expect(page.getByTestId(`acquired-${FIRST}`)).toHaveCount(0);

	await openTab(page, "Missions");
	await expect(page.getByTestId("mission")).toHaveAttribute("data-objective", SECOND);
	await expect(page.getByTestId(`step-${FIRST}`)).toHaveAttribute("data-state", "skipped");

	await openTab(page, "Progress");
	await page.getByRole("button", { name: /^Undo skip/ }).click();
	await expect(page.getByTestId("report-position")).toHaveAttribute("data-step", FIRST);
	await expect(page.getByTestId(`skipped-${FIRST}`)).toHaveCount(0);
});
