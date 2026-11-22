import { createFileRoute } from "@tanstack/react-router";
import { requireParentArea } from "#/components/parent-gate";
import { PrintableWorksheets } from "#/components/printable-worksheets";
import { useProgress } from "#/components/student-progress";
import { WorksheetChecks } from "#/components/worksheet-checks";

export const Route = createFileRoute("/_authed/students/$studentId/worksheets")({
	beforeLoad: requireParentArea,
	component: WorksheetsTab,
});

function WorksheetsTab() {
	const { student, objectives, printables } = useProgress();
	return (
		<div className="space-y-6">
			<PrintableWorksheets studentId={student.id} objectives={printables} />
			<WorksheetChecks
				studentId={student.id}
				objectives={objectives.map((o) => ({ code: o.code, statement: o.statement }))}
			/>
		</div>
	);
}
