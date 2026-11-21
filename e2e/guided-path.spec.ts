import { expect, test } from "@playwright/test";
import { addLearner, completeLesson, placeOnStep, signUp, startMission } from "./lesson-helpers";

test.use({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100.54" } });

const FIRST = "MA-Y3-AS-MENTAL";
const SECOND = "MA-Y3-AS-COLUMN";
const THIRD = "EN-Y3-PU-INVERTED-COMMAS";

test("two missions in a row move along the path and a locked step cannot be started", async ({ page }) => {
	await signUp(page, `parent-path-${Date.now()}@example.test`);
	await addLearner(page, "Dara", "3");
	await page.getByRole("link", { name: "Open Dara" }).click();
	await placeOnStep(page, FIRST);
	const course = page.getByTestId("course");
	await expect(course.getByRole("button")).toHaveCount(0);
	await expect(course.getByRole("link")).toHaveCount(0);
	await expect(page.getByTestId(`step-${SECOND}`)).toHaveAttribute("data-state", "locked");

	await startMission(page, FIRST);
	await completeLesson(page);
	await page.getByTestId("result").getByRole("link", { name: "Back to course" }).click();
	await expect(page.getByTestId(`step-${FIRST}`)).toHaveAttribute("data-state", "done");
	await expect(page.getByTestId(`step-${THIRD}`)).toHaveAttribute("data-state", "locked");

	const forged = await page.context().newPage();
	await forged.goto(page.url(), { waitUntil: "networkidle" });
	await forged.route("**/_serverFn/**", async (route) => {
		const body = route.request().postData() ?? "";
		if (!body.includes(SECOND)) return route.continue();
		await route.continue({ postData: body.replaceAll(SECOND, THIRD) });
	});
	const refused = forged.waitForResponse((r) => r.url().includes("/_serverFn/") && r.request().method() === "POST");
	await forged.getByTestId("mission").getByRole("button", { name: "Launch mission" }).click();
	expect((await refused).request().postData()).toContain(THIRD);
	await expect(forged.getByRole("alert")).toContainText("Nova has a different mission ready for today.");
	await expect(forged).not.toHaveURL(/\/learn\//);
	await expect(forged.getByTestId(`step-${THIRD}`)).toHaveAttribute("data-state", "locked");
	await forged.close();

	await page.reload({ waitUntil: "networkidle" });
	await startMission(page, SECOND);
	await completeLesson(page);
	await page.getByTestId("result").getByRole("link", { name: "Back to course" }).click();
	await expect(page.getByTestId(`step-${SECOND}`)).toHaveAttribute("data-state", "done");
	await expect(page.getByTestId("mission")).toHaveAttribute("data-objective", THIRD);
	await expect(page.getByTestId(`step-${THIRD}`)).toHaveAttribute("data-state", "current");
	await expect(page.getByTestId("unit-transition")).toContainText("Unit complete: Addition and subtraction.");
});
