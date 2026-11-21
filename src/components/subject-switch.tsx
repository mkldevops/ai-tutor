import type { Subject } from "#/domain/types";
import { SUBJECTS } from "./lesson-visual";

export function subjectsIn(items: { subject: Subject }[]): Subject[] {
	return (Object.keys(SUBJECTS) as Subject[]).filter((s) => items.some((i) => i.subject === s));
}
