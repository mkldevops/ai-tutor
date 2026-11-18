import type { SourceProvenance } from "#/domain/types";
import { type CurriculumObjective, ENGLAND_NC_CODE, type PrerequisiteEdge } from "./england-nc-maths.ts";

const DFE_ENGLISH = {
	publisher: "Department for Education",
	publishedAt: "2013-09-11",
	lastUpdatedAt: "2014-07-16",
	retrievedAt: "2026-11-18",
	verification: "verbatim_checked",
	licence: "Open Government Licence v3.0",
} as const;

const programmeOfStudy: SourceProvenance = {
	...DFE_ENGLISH,
	title: "National curriculum in England: English programmes of study",
	reference: "DFE-00181-2013",
	url: "https://www.gov.uk/government/publications/national-curriculum-in-england-english-programmes-of-study/national-curriculum-in-england-english-programmes-of-study",
};

const appendix2: SourceProvenance = {
	...DFE_ENGLISH,
	title: "English Appendix 2: Vocabulary, grammar and punctuation",
	reference: "DFE-00181-2013, English Appendix 2",
	url: "https://assets.publishing.service.gov.uk/media/5a7d913aed915d3fb959486f/English_Appendix_2_-_Vocabulary_grammar_and_punctuation.pdf",
};

const base = { curriculumCode: ENGLAND_NC_CODE, subject: "english", status: "approved" } as const;

export const ENGLISH_OBJECTIVES: CurriculumObjective[] = [
	{
		...base,
		code: "EN-Y2-GR-TENSE",
		yearGroup: 2,
		strand: "Grammar – verbs and tense",
		title: "Use the past and present tense",
		statement: "Correct choice and consistent use of present tense and past tense throughout writing",
		assessmentCriteria: [
			"Chooses the past tense when the sentence is about the past",
			"Chooses the present tense for things that happen now or every day",
		],
		explanation: [
			"A verb changes to show when something happens. Yesterday I walked. Every day I walk.",
			"Words like yesterday or last week tell you to use the past tense. Every day tells you to use the present.",
		],
		source: appendix2,
	},
	{
		...base,
		code: "EN-Y3-SP-PREFIXES",
		yearGroup: 3,
		strand: "Spelling – prefixes",
		title: "Add prefixes to words",
		statement: "use further prefixes and suffixes and understand how to add them",
		assessmentCriteria: [
			"Adds dis–, mis–, in–, re–, sub– and inter– to a root word without changing its spelling",
			"Uses il– before l, im– before m or p, and ir– before r",
			"Matches a prefix to its meaning: not, badly, again, under, between",
		],
		explanation: [
			"A prefix goes at the start of a word and changes its meaning. The root word keeps its spelling: dis + agree = disagree.",
			"in– means not. It becomes il– before l (illegal), im– before m or p (impossible) and ir– before r (irregular).",
		],
		source: programmeOfStudy,
	},
	{
		...base,
		code: "EN-Y3-GR-PRESENT-PERFECT",
		yearGroup: 3,
		strand: "Grammar – verbs and tense",
		title: "Use the present perfect",
		statement:
			"Use of the present perfect form of verbs instead of the simple past [for example, He has gone out to play contrasted with He went out to play]",
		assessmentCriteria: [
			"Forms the present perfect with has or have and the past participle",
			"Uses has with one person or thing and have with I, you, we, they or more than one",
		],
		explanation: [
			"The present perfect is has or have plus the past participle: she has finished, they have gone.",
			"Use has for one person or thing (Leo has eaten). Use have for I, you, we, they or more than one (We have eaten).",
		],
		source: appendix2,
	},
	{
		...base,
		code: "EN-Y3-PU-INVERTED-COMMAS",
		yearGroup: 3,
		strand: "Punctuation – direct speech",
		title: "Punctuate speech with inverted commas",
		statement: "Introduction to inverted commas to punctuate direct speech",
		assessmentCriteria: [
			"Puts inverted commas around the words a character actually says",
			"Keeps the punctuation that ends the speech inside the inverted commas",
		],
		explanation: [
			'Inverted commas go around the exact words someone says: "Can we go now?" asked Ella.',
			'The comma, question mark or exclamation mark that ends the speech goes inside: "I am hungry," said Tom.',
		],
		source: appendix2,
	},
	{
		...base,
		code: "EN-Y5-SP-VERB-PREFIXES",
		yearGroup: 5,
		strand: "Spelling – verb prefixes",
		title: "Use verb prefixes",
		statement: "Verb prefixes [for example, dis–, de–, mis–, over– and re–]",
		assessmentCriteria: [
			"Adds dis–, de–, mis–, over– or re– to a verb without changing its spelling",
			"Chooses the prefix that gives the meaning needed",
		],
		explanation: [
			"A verb prefix changes what the verb means: re– means again, over– means too much, mis– means wrongly.",
			"de– means remove or reverse (defrost) and dis– means not or undo (disconnect). The verb keeps its spelling.",
		],
		source: appendix2,
	},
	{
		...base,
		code: "EN-Y5-GR-RELATIVE-CLAUSES",
		yearGroup: 5,
		strand: "Grammar – relative clauses",
		title: "Use relative clauses",
		statement: "Relative clauses beginning with who, which, where, when, whose, that, or an omitted relative pronoun",
		assessmentCriteria: [
			"Chooses who, which, where, when or whose to begin a relative clause",
			"Finds the relative clause in a sentence",
		],
		explanation: [
			"A relative clause adds information about a noun. It starts with a relative pronoun: My sister, who is ten, loves swimming.",
			"Use who for people, which for things, where for places, when for times and whose for something that belongs to someone.",
		],
		source: appendix2,
	},
	{
		...base,
		code: "EN-Y5-GR-POSSIBILITY",
		yearGroup: 5,
		strand: "Grammar – possibility",
		title: "Show how likely something is",
		statement:
			"Indicating degrees of possibility using adverbs [for example, perhaps, surely] or modal verbs [for example, might, should, will, must]",
		assessmentCriteria: [
			"Tells words that show certainty from words that show possibility",
			"Finds the modal verb in a sentence",
		],
		explanation: [
			"Some words show how likely something is. Will and must sound certain. Might, may, could and perhaps show it is only possible.",
			"A modal verb comes just before the main verb: It might rain. We will win.",
		],
		source: appendix2,
	},
];

export const ENGLISH_PREREQUISITES: PrerequisiteEdge[] = [
	{ objectiveCode: "EN-Y3-GR-PRESENT-PERFECT", prerequisiteCode: "EN-Y2-GR-TENSE" },
	{ objectiveCode: "EN-Y5-SP-VERB-PREFIXES", prerequisiteCode: "EN-Y3-SP-PREFIXES" },
];

export const ENGLISH_LESSON_OBJECTIVES_BY_YEAR: Record<3 | 5, string[]> = {
	3: ["EN-Y3-SP-PREFIXES", "EN-Y3-GR-PRESENT-PERFECT", "EN-Y3-PU-INVERTED-COMMAS"],
	5: ["EN-Y5-SP-VERB-PREFIXES", "EN-Y5-GR-RELATIVE-CLAUSES", "EN-Y5-GR-POSSIBILITY"],
};
