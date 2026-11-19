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

export const MATHS_OBJECTIVES: CurriculumObjective[] = [
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
	{
		code: "MA-Y3-PV-DIGIT-VALUE",
		curriculumCode: ENGLAND_NC_CODE,
		subject: "maths",
		yearGroup: 3,
		strand: "Number – number and place value",
		title: "Value of each digit to 999",
		statement: "recognise the place value of each digit in a 3-digit number (100s, 10s, 1s)",
		assessmentCriteria: [
			"Says the value of any digit in a three-digit number",
			"Partitions a three-digit number into hundreds, tens and ones",
		],
		explanation: [
			"The place of a digit tells you its value. In 472, the 4 is worth 400, the 7 is worth 70 and the 2 is worth 2.",
			"You can split a number into its parts: 472 = 400 + 70 + 2.",
		],
		source,
		status: "approved",
	},
	{
		code: "MA-Y3-AS-COLUMN",
		curriculumCode: ENGLAND_NC_CODE,
		subject: "maths",
		yearGroup: 3,
		strand: "Number – addition and subtraction",
		title: "Column adding and subtracting",
		statement:
			"add and subtract numbers with up to 3 digits, using formal written methods of columnar addition and subtraction",
		assessmentCriteria: [
			"Adds two three-digit numbers in columns, exchanging when a column makes 10 or more",
			"Subtracts a three-digit number in columns, exchanging when the top digit is smaller",
			"Solves simple word problems with column methods",
		],
		explanation: [
			"Write the numbers in columns: hundreds under hundreds, tens under tens, ones under ones.",
			"Always start with the ones column, then the tens, then the hundreds.",
			"Adding: if a column makes 10 or more, write the ones digit and exchange 10 for 1 in the next column.",
			"Subtracting: if the top digit is smaller, exchange 1 from the next column for 10 in this column.",
		],
		source,
		status: "approved",
	},
	{
		code: "MA-Y3-MD-WRITTEN",
		curriculumCode: ENGLAND_NC_CODE,
		subject: "maths",
		yearGroup: 3,
		strand: "Number – multiplication and division",
		title: "Two-digit times one-digit",
		statement:
			"write and calculate mathematical statements for multiplication and division using the multiplication tables that they know, including for two-digit numbers times one-digit numbers, using mental and progressing to formal written methods",
		assessmentCriteria: [
			"Multiplies a two-digit number by 2, 3, 4, 5 or 8 by partitioning",
			"Finds a missing number in a multiplication statement",
		],
		explanation: [
			"Split the two-digit number into tens and ones: 23 = 20 + 3.",
			"Multiply each part, then add: 23 × 4 = 20 × 4 + 3 × 4 = 80 + 12 = 92.",
		],
		source,
		status: "approved",
	},
	{
		code: "MA-Y3-FR-OF-AMOUNT",
		curriculumCode: ENGLAND_NC_CODE,
		subject: "maths",
		yearGroup: 3,
		strand: "Number – fractions",
		title: "Fractions of a set",
		statement:
			"recognise, find and write fractions of a discrete set of objects: unit fractions and non-unit fractions with small denominators",
		assessmentCriteria: [
			"Finds a unit fraction of a set by dividing by the denominator",
			"Finds a non-unit fraction of a set with a small denominator",
		],
		explanation: [
			"The bottom number (denominator) tells you how many equal groups. To find 1/4 of 20, share 20 into 4 groups: 5.",
			"The top number (numerator) tells you how many groups to take. 3/4 of 20 is 3 groups of 5: 15.",
		],
		source,
		status: "approved",
	},
	{
		code: "MA-Y5-PV-DIGIT-VALUE",
		curriculumCode: ENGLAND_NC_CODE,
		subject: "maths",
		yearGroup: 5,
		strand: "Number – number and place value",
		title: "Digits in numbers to a million",
		statement: "read, write, order and compare numbers to at least 1,000,000 and determine the value of each digit",
		assessmentCriteria: [
			"Determines the value of each digit in numbers up to 1,000,000",
			"Partitions a five- or six-digit number by place value",
			"Finds the largest number in a set of large numbers",
		],
		explanation: [
			"Each place is worth 10 times the place to its right: ones, tens, hundreds, thousands, ten thousands, hundred thousands.",
			"In 852,316 the 8 is worth 800,000 and the 5 is worth 50,000.",
			"To compare numbers, look at the digits from the left. The first different digit tells you which is larger.",
		],
		source,
		status: "approved",
	},
	{
		code: "MA-Y5-AS-COLUMN",
		curriculumCode: ENGLAND_NC_CODE,
		subject: "maths",
		yearGroup: 5,
		strand: "Number – addition and subtraction",
		title: "Column methods with big numbers",
		statement:
			"add and subtract whole numbers with more than 4 digits, including using formal written methods (columnar addition and subtraction)",
		assessmentCriteria: [
			"Adds numbers with more than 4 digits in columns",
			"Subtracts numbers with more than 4 digits in columns, exchanging across several places",
			"Solves word problems with large numbers",
		],
		explanation: [
			"Line up the digits by place value, then work from the ones column to the left.",
			"Exchange when a column makes 10 or more, or when the top digit is too small to subtract from.",
			"Check a subtraction by adding the answer to the number you took away.",
		],
		source,
		status: "approved",
	},
	{
		code: "MA-Y5-MD-PRIMES",
		curriculumCode: ENGLAND_NC_CODE,
		subject: "maths",
		yearGroup: 5,
		strand: "Number – multiplication and division",
		title: "Prime numbers",
		statement:
			"know and use the vocabulary of prime numbers, prime factors and composite (non-prime) numbers; establish whether a number up to 100 is prime and recall prime numbers up to 19",
		assessmentCriteria: [
			"Recalls the prime numbers up to 19",
			"Decides whether a number up to 100 is prime",
			"Finds the smallest prime factor of a composite number",
		],
		explanation: [
			"A prime number has exactly two factors: 1 and itself. 7 is prime because only 1 × 7 makes 7.",
			"A composite number has more than two factors. 9 is composite because 3 × 3 = 9. The number 1 is not prime.",
			"The prime numbers up to 19 are 2, 3, 5, 7, 11, 13, 17 and 19.",
		],
		source,
		status: "approved",
	},
	{
		code: "MA-Y5-MD-SQUARES",
		curriculumCode: ENGLAND_NC_CODE,
		subject: "maths",
		yearGroup: 5,
		strand: "Number – multiplication and division",
		title: "Square and cube numbers",
		statement: "recognise and use square numbers and cube numbers, and the notation for squared (²) and cubed (³)",
		assessmentCriteria: [
			"Calculates squares and cubes written with ² and ³",
			"Recognises square numbers and cube numbers",
		],
		explanation: [
			"A square number is a number times itself. 5² means 5 × 5 = 25.",
			"A cube number is a number times itself, three times. 2³ means 2 × 2 × 2 = 8.",
		],
		source,
		status: "approved",
	},
];

export const MATHS_PREREQUISITES: PrerequisiteEdge[] = [
	{ objectiveCode: "MA-Y3-AS-MENTAL", prerequisiteCode: "MA-Y2-AS-MENTAL" },
	{ objectiveCode: "MA-Y5-MD-POWERS10", prerequisiteCode: "MA-Y4-FR-DIV10-100" },
	{ objectiveCode: "MA-Y3-AS-COLUMN", prerequisiteCode: "MA-Y3-AS-MENTAL" },
	{ objectiveCode: "MA-Y3-MD-WRITTEN", prerequisiteCode: "MA-Y3-MD-TABLES-348" },
	{ objectiveCode: "MA-Y3-FR-OF-AMOUNT", prerequisiteCode: "MA-Y3-MD-TABLES-348" },
	{ objectiveCode: "MA-Y5-PV-DIGIT-VALUE", prerequisiteCode: "MA-Y3-PV-DIGIT-VALUE" },
	{ objectiveCode: "MA-Y5-AS-COLUMN", prerequisiteCode: "MA-Y3-AS-COLUMN" },
	{ objectiveCode: "MA-Y5-MD-PRIMES", prerequisiteCode: "MA-Y5-MD-FACTORS" },
	{ objectiveCode: "MA-Y5-MD-SQUARES", prerequisiteCode: "MA-Y3-MD-TABLES-348" },
];

export const MATHS_LESSON_OBJECTIVES_BY_YEAR: Record<3 | 5, string[]> = {
	3: [
		"MA-Y3-AS-MENTAL",
		"MA-Y3-PV-MORE-LESS",
		"MA-Y3-MD-TABLES-348",
		"MA-Y3-PV-DIGIT-VALUE",
		"MA-Y3-AS-COLUMN",
		"MA-Y3-MD-WRITTEN",
		"MA-Y3-FR-OF-AMOUNT",
	],
	5: [
		"MA-Y5-MD-POWERS10",
		"MA-Y5-PV-ROUND",
		"MA-Y5-MD-FACTORS",
		"MA-Y5-PV-DIGIT-VALUE",
		"MA-Y5-AS-COLUMN",
		"MA-Y5-MD-PRIMES",
		"MA-Y5-MD-SQUARES",
	],
};
