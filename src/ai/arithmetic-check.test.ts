import { describe, expect, it } from "vitest";
import { findArithmeticErrors } from "./arithmetic-check";

describe("findArithmeticErrors", () => {
	it("accepts correct calculations", () => {
		const text = "352 + 200 = 552. 382 − 30 = 352. 3 × 4 = 12. 98 ÷ 4 = 24.5. 1,200 - 200 = 1,000. 2 + 3 × 4 = 14.";
		expect(findArithmeticErrors(text)).toEqual([]);
	});

	it("reports a wrong calculation with the correct result", () => {
		expect(findArithmeticErrors("So 735 − 20 = 725, see?")).toEqual([
			{ claim: "735 − 20 = 725", correct: "735 − 20 = 715" },
		]);
	});

	it("checks the whole chain, not just its tail", () => {
		expect(findArithmeticErrors("3 + 4 + 5 = 12")).toEqual([]);
		expect(findArithmeticErrors("3 + 4 + 5 = 9")).toHaveLength(1);
	});

	it("ignores fractions, remainders, missing-number boxes and words", () => {
		const text = "6/9 = 2/3. 98 ÷ 4 = 24 r 2. 111 + ☐ = 121. A three-digit number = 3 digits. 98 ÷ 4 = 98/4.";
		expect(findArithmeticErrors(text)).toEqual([]);
	});
});
