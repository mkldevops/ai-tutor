import { Link } from "@tanstack/react-router";
import { LessonArt, SUBJECTS } from "#/components/lesson-visual";
import type { Course } from "#/server/services/mission";
import { extraUnits } from "./extra-units";

export function ExtraPractice({
	studentId,
	course,
	pending,
	onPractise,
}: {
	studentId: string;
	course: Course;
	pending: boolean;
	onPractise: (objectiveCode: string) => void;
}) {
	const units = extraUnits(course);
	if (units.length === 0) return null;
	return (
		<section aria-labelledby="extra-title" className="card card-extra space-y-4" data-testid="extra-practice">
			<div className="space-y-1">
				<p className="meta">Outside the course</p>
				<h2 id="extra-title" className="h2">
					Extra practice
				</h2>
				<p className="text-sm text-soft">
					Practise a step already reached, just for fun. Extras never move the course forward.
				</p>
			</div>
			<ul className="space-y-4">
				{units.map((unit) => (
					<li key={unit.id} className="space-y-2" aria-labelledby={`extra-unit-${unit.id}`}>
						<p id={`extra-unit-${unit.id}`} className="meta">
							{SUBJECTS[unit.subject]} · {unit.title}
						</p>
						<ul className="space-y-2">
							{unit.steps.map((step) => (
								<li key={step.code} className="flex items-center gap-3" data-testid={`extra-${step.code}`}>
									<LessonArt strand={step.strand} size={44} />
									<p className="min-w-0 flex-1 font-semibold">{step.title}</p>
									<button
										type="button"
										className="btn-secondary"
										disabled={pending}
										aria-label={`Practise ${step.title}`}
										onClick={() => onPractise(step.code)}
									>
										Practise
									</button>
								</li>
							))}
						</ul>
					</li>
				))}
			</ul>
			<Link to="/students/$studentId/worksheets" params={{ studentId }} className="link text-sm">
				Print a worksheet
			</Link>
		</section>
	);
}
