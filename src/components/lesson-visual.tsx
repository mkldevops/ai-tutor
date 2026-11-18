import type { Subject } from "#/domain/types";

export const SUBJECTS: Record<Subject, string> = { maths: "Maths", english: "English" };

const STRANDS: { match: string; label: string; image: string }[] = [
	{ match: "addition and subtraction", label: "Addition & subtraction", image: "/lessons/addition-subtraction.webp" },
	{ match: "place value", label: "Place value", image: "/lessons/place-value.webp" },
	{ match: "multiplication and division", label: "Times & division", image: "/lessons/multiplication-division.webp" },
	{ match: "fractions", label: "Fractions & decimals", image: "/lessons/fractions-decimals.webp" },
];

export function strandVisual(strand: string): { label: string; image: string | null } {
	const found = STRANDS.find((s) => strand.toLowerCase().includes(s.match));
	if (found) return { label: found.label, image: found.image };
	const label = strand.replace(/^.*–\s*/, "");
	return { label: label.charAt(0).toUpperCase() + label.slice(1), image: null };
}

export function SubjectTag({ subject, strand }: { subject: Subject; strand: string }) {
	return (
		<span className="subject-tag" data-subject={subject}>
			<span className="subject-tag__subject">{SUBJECTS[subject]}</span>
			<span className="subject-tag__strand">{strandVisual(strand).label}</span>
		</span>
	);
}

export function LessonArt({ strand, size = 88 }: { strand: string; size?: number }) {
	const { image } = strandVisual(strand);
	return (
		<div className="lesson-art" style={{ width: size, height: size }} aria-hidden="true">
			{image ? (
				<img src={image} alt="" width={size} height={size} loading="lazy" />
			) : (
				<span className="lesson-art__glyph" style={{ fontSize: size * 0.38 }}>
					Aa
				</span>
			)}
		</div>
	);
}
