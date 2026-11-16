import { describe, expect, it } from "vitest";
import { FLIGHT_STEPS, flightStep, ORBITS, placePlanets, planetKind } from "./learning-map";

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

describe("planetKind", () => {
	it("follows the competency status", () => {
		expect(planetKind("mastered")).toBe("lasting");
		expect(planetKind("secure")).toBe("secure");
		expect(planetKind("developing")).toBe("active");
		expect(planetKind("emerging")).toBe("active");
		expect(planetKind("not_started")).toBe("unreached");
		expect(planetKind("needs_review")).toBe("review");
	});

	it("flags a due review even on a secure skill", () => {
		expect(planetKind("secure", true)).toBe("review");
	});
});

describe("placePlanets", () => {
	it("places each planet on its orbit ellipse", () => {
		const planets = placePlanets(7);
		expect(planets).toHaveLength(7);
		for (const p of planets) {
			const { rx, ry } = ORBITS[p.orbit];
			expect((p.x / rx) ** 2 + (p.y / ry) ** 2).toBeCloseTo(1, 1);
		}
	});

	it("never stacks two planets on the same spot", () => {
		const keys = placePlanets(9).map((p) => `${p.x},${p.y}`);
		expect(new Set(keys).size).toBe(9);
	});
});
