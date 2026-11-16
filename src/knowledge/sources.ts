import type { Subject } from "#/domain/types";

export type SourceFormat = "govuk-content-api";

export type SourceDefinition = {
	sourceKey: string;
	publisher: string;
	title: string;
	pageUrl: string;
	fetchUrl: string;
	format: SourceFormat;
	subject: Subject;
	licence: string;
	licenceUrl: string;
	attribution: string;
	redistribution: "allowed" | "link_only";
	checkIntervalDays: number;
	excludeSections?: RegExp;
	rightsVerifiedAt: string;
	rightsNote: string;
};

export const CLEARED_LICENCES = new Set(["Open Government Licence v3.0"]);

export const ALLOWED_FETCH_HOSTS = new Set(["www.gov.uk"]);

const DFE_MATHS_PATH =
	"government/publications/national-curriculum-in-england-mathematics-programmes-of-study/national-curriculum-in-england-mathematics-programmes-of-study";

export const SOURCES: SourceDefinition[] = [
	{
		sourceKey: "dfe-nc-maths-pos",
		publisher: "Department for Education",
		title: "National curriculum in England: mathematics programmes of study",
		pageUrl: `https://www.gov.uk/${DFE_MATHS_PATH}`,
		fetchUrl: `https://www.gov.uk/api/content/${DFE_MATHS_PATH}`,
		format: "govuk-content-api",
		subject: "maths",
		licence: "Open Government Licence v3.0",
		licenceUrl: "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
		attribution: "Contains public sector information licensed under the Open Government Licence v3.0.",
		redistribution: "allowed",
		checkIntervalDays: 7,
		excludeSections: /^key stage [34]\b/i,
		rightsVerifiedAt: "2026-11-15",
		rightsNote:
			"GOV.UK publication, OGL v3.0 unless stated otherwise. Public content API, no key; one request per check.",
	},
];

export function getSourceDefinition(sourceKey: string): SourceDefinition | undefined {
	return SOURCES.find((s) => s.sourceKey === sourceKey);
}

export function licenceClearance(def: SourceDefinition): { ok: true } | { ok: false; reason: string } {
	if (!CLEARED_LICENCES.has(def.licence)) return { ok: false, reason: `Licence not cleared: ${def.licence}` };
	if (def.redistribution !== "allowed") return { ok: false, reason: "Redistribution not permitted (link only)" };
	const host = new URL(def.fetchUrl).hostname;
	if (!ALLOWED_FETCH_HOSTS.has(host)) return { ok: false, reason: `Host not allowed: ${host}` };
	return { ok: true };
}
