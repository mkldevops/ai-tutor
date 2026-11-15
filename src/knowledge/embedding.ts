import { createHash } from "node:crypto";

export interface Embedder {
	readonly id: string;
	readonly dimensions: number;
	embed(texts: string[]): Promise<number[][]>;
}

const STOPWORDS = new Set(
	"a an and are as at be by for from has have in into is it its of on or that the their them they this to was were will with".split(
		" ",
	),
);

export function tokenize(text: string): string[] {
	return (
		text
			.toLowerCase()
			.normalize("NFKD")
			.match(/[a-z]+|\d+(?:[.,]\d+)*/g) ?? []
	)
		.map((t) => t.replace(/,/g, ""))
		.filter((t) => !STOPWORDS.has(t))
		.map((t) => (t.length > 4 && t.endsWith("s") && !t.endsWith("ss") ? t.slice(0, -1) : t));
}

function bucket(feature: string, dims: number): { index: number; sign: number } {
	const h = createHash("sha256").update(feature).digest();
	return { index: h.readUInt32BE(0) % dims, sign: (h[4] ?? 0) & 1 ? 1 : -1 };
}

export function createHashEmbedder(dimensions = 512): Embedder {
	return {
		id: `hash-v1-${dimensions}`,
		dimensions,
		async embed(texts) {
			return texts.map((text) => {
				const v = new Array<number>(dimensions).fill(0);
				const tokens = tokenize(text);
				const features = [...tokens, ...tokens.slice(1).map((t, i) => `${tokens[i]}_${t}`)];
				for (const f of features) {
					const { index, sign } = bucket(f, dimensions);
					v[index] = (v[index] ?? 0) + sign;
				}
				const norm = Math.hypot(...v) || 1;
				return v.map((x) => x / norm);
			});
		},
	};
}
