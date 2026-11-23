import { expect, test } from "@playwright/test";
import { programmeSteps } from "../src/curriculum/programme";
import { addLearner, completeLesson, signUp, startMission } from "./lesson-helpers";

test.use({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100.86" } });

const [FIRST] = programmeSteps(3).map((s) => s.objectiveCode) as [string];

test("with the daily cap on, a secured step leaves a neutral state until tomorrow", async ({ page }) => {
	await signUp(page, `parent-daily-cap-${Date.now()}@example.test`);
	await addLearner(page, "Noa", "3");
	await page.getByRole("link", { name: "Open Noa" }).click();
	const missions = page.url();

	await page.getByRole("link", { name: "Settings", exact: true }).click();
	const cap = page.getByTestId("daily-cap-settings");
	await cap.getByRole("checkbox", { name: "Limit to one new step a day" }).check();
	await expect(cap).toContainText("Saved");
	await expect(cap).toHaveAttribute("data-enabled", "true");

	await page.goto(missions, { waitUntil: "networkidle" });
	await startMission(page, FIRST);
	await completeLesson(page);
	await page.getByTestId("result").getByRole("link", { name: "Back to course" }).click();

	const mission = page.getByTestId("mission");
	await expect(page.getByTestId(`step-${FIRST}`)).toHaveAttribute("data-state", "done");
	await expect(mission).toHaveAttribute("data-reason", "done_for_today");
	await expect(page.getByTestId("mission-done-today")).toContainText("The next one opens tomorrow.");
	await expect(mission).not.toContainText(/programme complete|end of the Year/i);
	await expect(mission.getByRole("button", { name: "Launch mission" })).toHaveCount(0);
});
