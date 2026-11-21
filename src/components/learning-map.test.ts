import { describe, expect, it } from "vitest";
import { FLIGHT_STEPS, flightStep } from "./learning-map";

describe("flightStep", () => {
	it("maps lesson phases onto the four flight steps", () => {
		expect(flightStep("diagnostic")).toBe(0);
		expect(flightStep("instruction")).toBe(1);
		expect(flightStep("guided")).toBe(2);
		expect(flightStep("independent")).toBe(3);
	});

	it("marks every step done once complete and has no rail for reviews", () => {
		expect(flightStep("complete")).toBe(FLIGHT_STEPS.length);
		expect(flightStep("review")).toBeNull();
	});
});
