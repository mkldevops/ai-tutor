import { expect, test } from "@playwright/test";
import { addLearner, completeLesson, placeOnStep, signUp } from "./lesson-helpers";

test.use({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100.71" } });

const FIRST = "MA-Y3-AS-MENTAL";
const SECOND = "MA-Y3-AS-COLUMN";
const THIRD = "EN-Y3-PU-INVERTED-COMMAS";

test("an extra on a reached step leaves the course position unchanged", async ({ page }) => {
	await signUp(page, `parent-extra-${Date.now()}@example.test`);
	await addLearner(page, "Ivo", "3");
	await page.getByRole("link", { name: "Open Ivo" }).click();
	await placeOnStep(page, SECOND);

	const mission = page.getByTestId("mission");
	const count = page.getByTestId("course-count");
	await expect(mission).toHaveAttribute("data-objective", SECOND);
	const before = await count.textContent();

	const zone = page.getByTestId("extra-practice");
	await expect(zone.getByRole("heading", { name: "Extra practice" })).toBeVisible();
	await expect(zone.getByTestId(`extra-${FIRST}`)).toBeVisible();
	await expect(zone.getByTestId(`extra-${SECOND}`)).toBeVisible();
	await expect(zone.getByTestId(`extra-${THIRD}`)).toHaveCount(0);
	await expect(zone.getByRole("link", { name: "Print a worksheet" })).toBeVisible();
	const afterMission = await page.evaluate(() => {
		const m = document.querySelector('[data-testid="mission"]');
		const z = document.querySelector('[data-testid="extra-practice"]');
		return Boolean(m && z && m.compareDocumentPosition(z) & Node.DOCUMENT_POSITION_FOLLOWING);
	});
	expect(afterMission).toBe(true);

	await zone
		.getByTestId(`extra-${FIRST}`)
		.getByRole("button", { name: /^Practise / })
		.click();
	await expect(page).toHaveURL(/\/learn\//);
	await expect(page.getByTestId("phase")).toHaveAttribute("data-phase", "guided");
	await expect(page.getByTestId("phase")).toContainText("Extra practice");
	await expect(page.getByTestId("flight-plan")).toHaveCount(0);
	await completeLesson(page);

	const result = page.getByTestId("extra-result");
	await expect(result).toContainText("It does not change the course");
	await expect(page.getByTestId("result")).toHaveCount(0);
	await result.getByRole("link", { name: "Back to missions" }).click();

	await expect(mission).toHaveAttribute("data-objective", SECOND);
	await expect(mission).toHaveAttribute("data-reason", "current");
	await expect(page.getByTestId(`step-${FIRST}`)).toHaveAttribute("data-state", "done");
	await expect(page.getByTestId(`step-${SECOND}`)).toHaveAttribute("data-state", "current");
	await expect(page.getByTestId(`step-${THIRD}`)).toHaveAttribute("data-state", "locked");
	await expect(count).toHaveText(before ?? "");
});
