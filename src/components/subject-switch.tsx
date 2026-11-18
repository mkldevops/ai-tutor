import type { Subject } from "#/domain/types";
import { SUBJECTS } from "./lesson-visual";

export function subjectsIn(items: { subject: Subject }[]): Subject[] {
	return (Object.keys(SUBJECTS) as Subject[]).filter((s) => items.some((i) => i.subject === s));
}

export function SubjectSwitch({
	subjects,
	value,
	onChange,
	counts,
}: {
	subjects: Subject[];
	value: Subject;
	onChange: (subject: Subject) => void;
	counts?: Partial<Record<Subject, string>>;
}) {
	if (subjects.length < 2) return null;
	return (
		<div role="tablist" aria-label="Subject" className="tabs">
			{subjects.map((s) => (
				<button
					key={s}
					type="button"
					role="tab"
					id={`subject-tab-${s}`}
					aria-selected={value === s}
					aria-controls="subject-panel"
					className="tab"
					onClick={() => onChange(s)}
				>
					{SUBJECTS[s]}
					{counts?.[s] && <span className="text-ink-mute ml-1.5 text-xs font-normal">{counts[s]}</span>}
				</button>
			))}
		</div>
	);
}
