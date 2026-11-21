import type { Subject } from "#/domain/types";

export type ProgrammeUnit = {
	id: string;
	title: string;
	subject: Subject;
	objectiveCodes: readonly string[];
};

export type ProgrammeYear = 3 | 5;

export type ProgrammeStep = {
	index: number;
	objectiveCode: string;
	unitId: string;
	unitIndex: number;
	subject: Subject;
};

export const PROGRAMME_BY_YEAR: Record<ProgrammeYear, readonly ProgrammeUnit[]> = {
	3: [
		{
			id: "Y3-U1",
			title: "Words and spelling",
			subject: "english",
			objectiveCodes: ["EN-Y3-SP-PREFIXES", "EN-Y3-GR-A-AN"],
		},
		{
			id: "Y3-U2",
			title: "Place value",
			subject: "maths",
			objectiveCodes: ["MA-Y3-PV-DIGIT-VALUE", "MA-Y3-PV-MORE-LESS"],
		},
		{
			id: "Y3-U3",
			title: "Building sentences",
			subject: "english",
			objectiveCodes: ["EN-Y3-GR-CONJUNCTIONS", "EN-Y3-GR-PRESENT-PERFECT"],
		},
		{
			id: "Y3-U4",
			title: "Addition and subtraction",
			subject: "maths",
			objectiveCodes: ["MA-Y3-AS-MENTAL", "MA-Y3-AS-COLUMN"],
		},
		{
			id: "Y3-U5",
			title: "Speech and word families",
			subject: "english",
			objectiveCodes: ["EN-Y3-PU-INVERTED-COMMAS", "EN-Y3-SP-NOUN-PREFIXES", "EN-Y3-SP-WORD-FAMILIES"],
		},
		{
			id: "Y3-U6",
			title: "Multiplication, division and fractions",
			subject: "maths",
			objectiveCodes: ["MA-Y3-MD-TABLES-348", "MA-Y3-MD-WRITTEN", "MA-Y3-FR-OF-AMOUNT"],
		},
	],
	5: [
		{
			id: "Y5-U1",
			title: "Prefixes and suffixes",
			subject: "english",
			objectiveCodes: ["EN-Y5-SP-VERB-PREFIXES", "EN-Y5-SP-VERB-SUFFIXES"],
		},
		{
			id: "Y5-U2",
			title: "Place value and powers of 10",
			subject: "maths",
			objectiveCodes: ["MA-Y5-PV-DIGIT-VALUE", "MA-Y5-PV-ROUND", "MA-Y5-MD-POWERS10"],
		},
		{
			id: "Y5-U3",
			title: "Clauses and possibility",
			subject: "english",
			objectiveCodes: ["EN-Y5-GR-RELATIVE-CLAUSES", "EN-Y5-GR-POSSIBILITY"],
		},
		{
			id: "Y5-U4",
			title: "Written calculation and factors",
			subject: "maths",
			objectiveCodes: ["MA-Y5-AS-COLUMN", "MA-Y5-MD-FACTORS"],
		},
		{
			id: "Y5-U5",
			title: "Punctuation and cohesion",
			subject: "english",
			objectiveCodes: ["EN-Y5-PU-PARENTHESIS", "EN-Y5-GR-ADVERBIALS", "EN-Y5-SP-HOMOPHONES"],
		},
		{
			id: "Y5-U6",
			title: "Primes and square numbers",
			subject: "maths",
			objectiveCodes: ["MA-Y5-MD-PRIMES", "MA-Y5-MD-SQUARES"],
		},
	],
};

export function programmeSteps(year: ProgrammeYear): ProgrammeStep[] {
	return PROGRAMME_BY_YEAR[year]
		.flatMap((unit, unitIndex) =>
			unit.objectiveCodes.map((objectiveCode) => ({
				objectiveCode,
				unitId: unit.id,
				unitIndex,
				subject: unit.subject,
			})),
		)
		.map((step, index) => ({ index, ...step }));
}

export function stepOf(year: ProgrammeYear, objectiveCode: string): ProgrammeStep | undefined {
	return programmeSteps(year).find((s) => s.objectiveCode === objectiveCode);
}
