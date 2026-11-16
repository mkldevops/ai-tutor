import type { SourceProvenance, Subject } from "#/domain/types";

export type CurriculumObjective = {
	code: string;
	curriculumCode: string;
	subject: Subject;
	yearGroup: number;
	strand: string;
	title: string;
	statement: string;
	assessmentCriteria: string[];
	explanation: string[];
	source: SourceProvenance;
	status: "approved" | "draft";
};

export type PrerequisiteEdge = { objectiveCode: string; prerequisiteCode: string };

export const ENGLAND_NC_CODE = "england-nc-2014";

export const ENGLAND_NC = {
	code: ENGLAND_NC_CODE,
	name: "National Curriculum in England",
	country: "GB-ENG",
	version: "2014 (HTML updated 2021-09-28)",
} as const;

const DFE_MATHS: Omit<SourceProvenance, "retrievedAt"> = {
	publisher: "Department for Education",
	title: "National curriculum in England: mathematics programmes of study",
	reference: "DFE-00180-2013",
	url: "https://www.gov.uk/government/publications/national-curriculum-in-england-mathematics-programmes-of-study/national-curriculum-in-england-mathematics-programmes-of-study",
	publishedAt: "2013-09-11",
	lastUpdatedAt: "2021-09-28",
	verification: "verbatim_checked",
	licence: "Open Government Licence v3.0",
};

const source: SourceProvenance = { ...DFE_MATHS, retrievedAt: "2026-11-15" };

export const OBJECTIVES: CurriculumObjective[] = [
	{
		code: "MA-Y2-AS-MENTAL",
		curriculumCode: ENGLAND_NC_CODE,
		subject: "maths",
		yearGroup: 2,
		strand: "Number – addition and subtraction",
		title: "Add and subtract two-digit numbers",
		statement:
			"add and subtract numbers using concrete objects, pictorial representations, and mentally, including: a two-digit number and 1s; a two-digit number and 10s; 2 two-digit numbers; adding 3 one-digit numbers",
		assessmentCriteria: [
			"Adds and subtracts a two-digit number and ones mentally",
			"Adds and subtracts a two-digit number and tens mentally",
		],
		explanation: [
			"A two-digit number is made of tens and ones. 47 is 4 tens and 7 ones.",
			"Adding ones changes the ones digit. Adding tens changes the tens digit.",
		],
		source,
		status: "approved",
	},
	{
		code: "MA-Y3-AS-MENTAL",
		curriculumCode: ENGLAND_NC_CODE,
		subject: "maths",
		yearGroup: 3,
		strand: "Number – addition and subtraction",
		title: "Mental adding and subtracting to 999",
		statement:
			"add and subtract numbers mentally, including: a three-digit number and 1s; a three-digit number and 10s; a three-digit number and 100s",
		assessmentCriteria: [
			"Adds and subtracts ones, tens and hundreds to/from a three-digit number mentally",
			"Handles crossing a ten or a hundred",
			"Solves missing-number and simple word problems",
		],
		explanation: [
			"A three-digit number has hundreds, tens and ones. 352 is 3 hundreds, 5 tens and 2 ones.",
			"When you add or subtract hundreds, only the hundreds digit changes: 352 + 200 = 552.",
			"When you add or subtract tens, look at the tens digit: 352 + 30 = 382.",
			"If the tens go past 9, exchange 10 tens for 1 hundred: 382 + 40 = 422.",
			"Check your answer with the inverse: if 352 + 30 = 382, then 382 − 30 = 352.",
		],
		source,
		status: "approved",
	},
	{
		code: "MA-Y3-PV-MORE-LESS",
		curriculumCode: ENGLAND_NC_CODE,
		subject: "maths",
		yearGroup: 3,
		strand: "Number – number and place value",
		title: "Count in steps and find 10 or 100 more",
		statement: "count from 0 in multiples of 4, 8, 50 and 100; find 10 or 100 more or less than a given number",
		assessmentCriteria: [
			"Finds 10 or 100 more or less than a three-digit number",
			"Continues a count in multiples of 4, 8, 50 and 100",
		],
		explanation: [
			"10 more changes the tens digit by one. 100 more changes the hundreds digit by one.",
			"If the tens digit is 9, 10 more makes it 0 and the hundreds go up: 395 + 10 = 405.",
			"Counting in 4s, 8s, 50s or 100s means adding the same amount each step.",
		],
		source,
		status: "approved",
	},
	{
		code: "MA-Y3-MD-TABLES-348",
		curriculumCode: ENGLAND_NC_CODE,
		subject: "maths",
		yearGroup: 3,
		strand: "Number – multiplication and division",
		title: "The 3, 4 and 8 times tables",
		statement: "recall and use multiplication and division facts for the 3, 4 and 8 multiplication tables",
		assessmentCriteria: [
			"Recalls multiplication facts for the 3, 4 and 8 tables",
			"Uses the inverse to find division facts",
		],
		explanation: [
			"The 8 times table is double the 4 times table: 4 × 6 = 24, so 8 × 6 = 48.",
			"Division undoes multiplication. If 3 × 7 = 21, then 21 ÷ 3 = 7.",
		],
		source,
		status: "approved",
	},
	{
		code: "MA-Y4-FR-DIV10-100",
		curriculumCode: ENGLAND_NC_CODE,
		subject: "maths",
		yearGroup: 4,
		strand: "Number – fractions (including decimals)",
		title: "Divide by 10 and 100 into decimals",
		statement:
			"find the effect of dividing a one- or two-digit number by 10 and 100, identifying the value of the digits in the answer as ones, tenths and hundredths",
		assessmentCriteria: [
			"Divides a one- or two-digit number by 10 and 100",
			"Names the value of digits as ones, tenths and hundredths",
		],
		explanation: [
			"Dividing by 10 makes a number 10 times smaller: each digit moves one place to the right.",
			"7 ÷ 10 = 0.7 (7 tenths). 7 ÷ 100 = 0.07 (7 hundredths).",
		],
		source,
		status: "approved",
	},
	{
		code: "MA-Y5-MD-POWERS10",
		curriculumCode: ENGLAND_NC_CODE,
		subject: "maths",
		yearGroup: 5,
		strand: "Number – multiplication and division",
		title: "Multiply and divide by 10, 100 and 1,000",
		statement: "multiply and divide whole numbers and those involving decimals by 10, 100 and 1,000",
		assessmentCriteria: [
			"Multiplies and divides whole numbers by 10, 100 and 1,000",
			"Multiplies and divides decimals by 10, 100 and 1,000",
			"Solves missing-number problems involving powers of ten",
		],
		explanation: [
			"Multiplying by 10 moves every digit one place to the left; by 100, two places; by 1,000, three places.",
			"Dividing moves every digit to the right by the same number of places.",
			"The decimal point does not move: the digits move. 3.4 × 100 = 340.",
			"Use a place-value chart (Th H T O . t h th) if you are unsure.",
		],
		source,
		status: "approved",
	},
	{
		code: "MA-Y5-PV-ROUND",
		curriculumCode: ENGLAND_NC_CODE,
		subject: "maths",
		yearGroup: 5,
		strand: "Number – number and place value",
		title: "Round big numbers",
		statement: "round any number up to 1,000,000 to the nearest 10, 100, 1,000, 10,000 and 100,000",
		assessmentCriteria: [
			"Rounds numbers up to 1,000,000 to the nearest 10, 100 and 1,000",
			"Rounds numbers up to 1,000,000 to the nearest 10,000 and 100,000",
		],
		explanation: [
			"Find the digit in the place you round to, then look at the digit just to its right.",
			"If that digit is 5 or more, round up. If it is 4 or less, round down: 347,812 → 348,000 to the nearest 1,000.",
		],
		source,
		status: "approved",
	},
	{
		code: "MA-Y5-MD-FACTORS",
		curriculumCode: ENGLAND_NC_CODE,
		subject: "maths",
		yearGroup: 5,
		strand: "Number – multiplication and division",
		title: "Multiples and factors",
		statement:
			"identify multiples and factors, including finding all factor pairs of a number, and common factors of 2 numbers",
		assessmentCriteria: [
			"Finds the partner in a factor pair",
			"Identifies factors and multiples of a number",
			"Finds common factors of 2 numbers",
		],
		explanation: [
			"A factor divides a number exactly. 6 is a factor of 42 because 6 × 7 = 42.",
			"Factors come in pairs: 1 × 24, 2 × 12, 3 × 8, 4 × 6. A common factor divides both numbers.",
		],
		source,
		status: "approved",
	},
];

export const PREREQUISITES: PrerequisiteEdge[] = [
	{ objectiveCode: "MA-Y3-AS-MENTAL", prerequisiteCode: "MA-Y2-AS-MENTAL" },
	{ objectiveCode: "MA-Y5-MD-POWERS10", prerequisiteCode: "MA-Y4-FR-DIV10-100" },
];

export const LESSON_OBJECTIVES_BY_YEAR: Record<3 | 5, string[]> = {
	3: ["MA-Y3-AS-MENTAL", "MA-Y3-PV-MORE-LESS", "MA-Y3-MD-TABLES-348"],
	5: ["MA-Y5-MD-POWERS10", "MA-Y5-PV-ROUND", "MA-Y5-MD-FACTORS"],
};

export function getObjective(code: string): CurriculumObjective | undefined {
	return OBJECTIVES.find((o) => o.code === code);
}

export function getPrerequisiteCodes(code: string): string[] {
	return PREREQUISITES.filter((e) => e.objectiveCode === code).map((e) => e.prerequisiteCode);
}
