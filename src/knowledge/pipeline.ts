import { createHash } from "node:crypto";
import { z } from "zod";
import { OBJECTIVES } from "#/curriculum/england-nc-maths";
import type { Subject } from "#/domain/types";

export type ChunkKind = "statutory" | "guidance" | "context";

export type Chunk = {
	ordinal: number;
	yearGroups: number[];
	section: string;
	strand: string;
	kind: ChunkKind;
	heading: string;
	text: string;
	checksum: string;
	objectiveCodes: string[];
	flags: string[];
};

export type ParsedDocument = {
	title: string;
	upstreamUpdatedAt: string | null;
	checksum: string;
	chunks: Chunk[];
};

const govukSchema = z.object({
	title: z.string().min(1),
	schema_name: z.string(),
	public_updated_at: z.string().nullish(),
	details: z.object({ body: z.string().min(1) }),
});

const ENTITIES: Record<string, string> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
	nbsp: " ",
	ndash: "–",
	mdash: "—",
	pound: "£",
	times: "×",
	divide: "÷",
};

export function decodeEntities(text: string): string {
	return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
		if (e[0] === "#") {
			const code = e[1] === "x" || e[1] === "X" ? Number.parseInt(e.slice(2), 16) : Number(e.slice(1));
			return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
		}
		return ENTITIES[e.toLowerCase()] ?? m;
	});
}

export function expandFractions(text: string): string {
	return text.replace(/(\d?)\[Fraction:(\d+)\/(\d+)\]/g, (_m, whole: string, n: string, d: string) =>
		whole ? `${whole} ${n}/${d}` : `${n}/${d}`,
	);
}

const INVISIBLE = new RegExp(
	`[${[
		[0x00, 0x08],
		[0x0b, 0x1f],
		[0x7f, 0x9f],
		[0x200b, 0x200f],
		[0x202a, 0x202e],
		[0x2060, 0x2064],
		[0xfeff, 0xfeff],
	]
		.map(([a, b]) => `\\u{${(a as number).toString(16)}}-\\u{${(b as number).toString(16)}}`)
		.join("")}]`,
	"gu",
);

export function normalizeText(text: string): string {
	return text
		.normalize("NFC")
		.replace(INVISIBLE, "")
		.replace(/[ \t ]+/g, " ")
		.split("\n")
		.map((l) => l.trim())
		.filter((l, i, all) => l !== "" || (i > 0 && all[i - 1] !== ""))
		.join("\n")
		.trim();
}

export const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

export const normalizeHeading = (text: string) =>
	text
		.toLowerCase()
		.replace(/[‐-―−-]/g, "-")
		.replace(/\s+/g, " ")
		.trim();

const INJECTION_PATTERNS: [string, RegExp][] = [
	["ignore_instructions", /\b(ignore|disregard|forget)\b.{0,40}\b(instructions|prompts?|rules)\b/i],
	["role_marker", /(^|\n)\s*(system|assistant|developer)\s*:/i],
	["role_tag", /<\|?\/?(system|im_start|im_end|assistant)\|?>/i],
	["reveal_prompt", /\b(reveal|print|show)\b.{0,30}\b(system prompt|instructions|api key|secret)/i],
	["persona_override", /\byou are now\b|\bact as (an?|the)\b/i],
	["tool_call", /\b(call|invoke|run) the (tool|function)\b/i],
];

export function detectInjection(text: string): string[] {
	return INJECTION_PATTERNS.filter(([, re]) => re.test(text)).map(([flag]) => `injection:${flag}`);
}

type Block = { section: string; strand: string; guidance: boolean; lines: string[] };

export function htmlToBlocks(html: string): Block[] {
	const blocks: Block[] = [];
	let section = "";
	let strand = "";
	let guidance = false;
	let current: Block | null = null;
	let heading: { level: number; text: string } | null = null;
	let line = "";
	let indent = "";
	let ulDepth = 0;
	let skip = 0;

	const flushLine = () => {
		const body = normalizeText(expandFractions(decodeEntities(line))).replace(/\n+/g, " ");
		const text = body ? `${indent}${body}` : "";
		line = "";
		indent = "";
		if (!text) return;
		if (!current) {
			current = { section, strand, guidance, lines: [] };
			blocks.push(current);
		}
		current.lines.push(text);
	};
	const startBlock = () => {
		flushLine();
		current = null;
	};

	for (const m of html.matchAll(/<(\/?)([a-z0-9]+)[^>]*>|([^<]+)/gi)) {
		const [, closing, rawTag, rawText] = m;
		if (rawText !== undefined) {
			if (skip > 0) continue;
			if (heading) heading.text += rawText;
			else line += rawText;
			continue;
		}
		const tag = (rawTag ?? "").toLowerCase();
		if (tag === "script" || tag === "style") {
			skip += closing ? -1 : 1;
			continue;
		}
		const level = /^h([1-6])$/.exec(tag);
		if (level) {
			if (!closing) {
				flushLine();
				heading = { level: Number(level[1]), text: "" };
				continue;
			}
			const text = normalizeText(expandFractions(decodeEntities(heading?.text ?? ""))).replace(/\n/g, " ");
			const lvl = heading?.level ?? 2;
			heading = null;
			if (lvl <= 2) {
				section = text;
				strand = "";
				guidance = false;
			} else if (lvl === 3) {
				strand = text;
				guidance = false;
			} else {
				guidance = /notes and guidance/i.test(text);
			}
			startBlock();
			continue;
		}
		if (tag === "ul" || tag === "ol") {
			flushLine();
			ulDepth = Math.max(0, ulDepth + (closing ? -1 : 1));
			continue;
		}
		if (tag === "li" && !closing) {
			flushLine();
			indent = `${"  ".repeat(Math.max(0, ulDepth - 1))}- `;
			continue;
		}
		if (tag === "div" && closing && guidance) {
			guidance = false;
			startBlock();
			continue;
		}
		if (["p", "li", "br", "div", "tr", "table"].includes(tag)) flushLine();
	}
	flushLine();
	return blocks;
}

const MAX_CHUNK_CHARS = 1800;

function splitLines(lines: string[]): string[] {
	const out: string[] = [];
	let buf: string[] = [];
	let size = 0;
	for (const l of lines) {
		if (size + l.length > MAX_CHUNK_CHARS && buf.length > 0) {
			out.push(buf.join("\n"));
			buf = [];
			size = 0;
		}
		buf.push(l.slice(0, MAX_CHUNK_CHARS));
		size += l.length + 1;
	}
	if (buf.length) out.push(buf.join("\n"));
	return out;
}

export function mapObjectives(subject: Subject, yearGroup: number | null, strand: string): string[] {
	if (yearGroup === null || !strand) return [];
	const target = normalizeHeading(strand);
	return OBJECTIVES.filter(
		(o) => o.subject === subject && o.yearGroup === yearGroup && normalizeHeading(o.strand) === target,
	).map((o) => o.code);
}

export function sectionYearGroups(section: string): number[] {
	const single = /^year (\d) programme of study$/i.exec(section);
	if (single) return [Number(single[1])];
	const pair = /\byears (\d) and (\d)\b/i.exec(section);
	return pair ? [Number(pair[1]), Number(pair[2])] : [];
}

export function blocksToChunks(blocks: Block[], subject: Subject, exclude?: RegExp): Chunk[] {
	const chunks: Chunk[] = [];
	const seen = new Set<string>();
	for (const b of blocks) {
		if (exclude?.test(b.section)) continue;
		const yearGroups = sectionYearGroups(b.section);
		const yearGroup = yearGroups.length === 1 ? (yearGroups[0] ?? null) : null;
		const kind: ChunkKind = yearGroup === null || !b.strand ? "context" : b.guidance ? "guidance" : "statutory";
		const heading = [b.section, b.strand, kind === "guidance" ? "Notes and guidance (non-statutory)" : ""]
			.filter(Boolean)
			.join(" › ");
		for (const text of splitLines(b.lines)) {
			const checksum = sha256(`${heading}\n${text}`);
			if (seen.has(checksum)) continue;
			seen.add(checksum);
			chunks.push({
				ordinal: chunks.length,
				yearGroups,
				section: b.section,
				strand: b.strand,
				kind,
				heading,
				text,
				checksum,
				objectiveCodes: mapObjectives(subject, yearGroup, b.strand),
				flags: detectInjection(text),
			});
		}
	}
	return chunks;
}

export function parseGovukContent(raw: unknown, subject: Subject, exclude?: RegExp): ParsedDocument {
	const doc = govukSchema.parse(raw);
	const chunks = blocksToChunks(htmlToBlocks(doc.details.body), subject, exclude);
	if (chunks.length === 0) throw new Error("No content found in document body");
	return {
		title: doc.title,
		upstreamUpdatedAt: doc.public_updated_at ?? null,
		checksum: sha256(chunks.map((c) => c.checksum).join("\n")),
		chunks,
	};
}

export function diffChunks(previous: string[], next: string[]) {
	const before = new Set(previous);
	const after = new Set(next);
	return {
		added: next.filter((c) => !before.has(c)).length,
		removed: previous.filter((c) => !after.has(c)).length,
	};
}
