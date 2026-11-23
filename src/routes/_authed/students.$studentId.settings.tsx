import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { DailyCapSettings } from "#/components/daily-cap-settings";
import { ErrorBox, useAction } from "#/components/form";
import { PaceSettings } from "#/components/pace-settings";
import { requireParentArea } from "#/components/parent-gate";
import { useProgress } from "#/components/student-progress";
import { VoiceSettings } from "#/components/voice-settings";
import { DEFAULT_PACE_TARGET } from "#/domain/types";
import { deleteStudentFn, exportStudentFn } from "#/server/functions";

export const Route = createFileRoute("/_authed/students/$studentId/settings")({
	beforeLoad: requireParentArea,
	component: SettingsTab,
});

function SettingsTab() {
	const { student } = useProgress();
	const router = useRouter();
	const [confirmName, setConfirmName] = useState("");

	const exportData = useAction(async () => {
		const json = await exportStudentFn({ data: { studentId: student.id } });
		const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
		const a = document.createElement("a");
		a.href = url;
		a.download = `learner-${student.id}.json`;
		a.click();
		URL.revokeObjectURL(url);
	});

	const remove = useAction(async () => {
		await deleteStudentFn({ data: { studentId: student.id, confirmName } });
		await router.navigate({ to: "/dashboard" });
	});

	return (
		<div className="space-y-6">
			<PaceSettings
				studentId={student.id}
				displayName={student.displayName}
				target={student.programme?.paceTarget ?? DEFAULT_PACE_TARGET}
			/>

			<DailyCapSettings
				studentId={student.id}
				displayName={student.displayName}
				enabled={student.programme?.dailyNewStepCap === true}
			/>

			<VoiceSettings
				studentId={student.id}
				displayName={student.displayName}
				enabled={student.preferences?.voice === true}
			/>

			<section className="card space-y-3">
				<h2 className="h2">Export data</h2>
				<p className="text-sm text-ink-soft">
					Download everything stored about {student.displayName}: sessions, answers and progress, as JSON.
				</p>
				<button type="button" className="btn-secondary" onClick={() => void exportData.run()}>
					Export data (JSON)
				</button>
				<ErrorBox error={exportData.error} />
			</section>

			<section className="card space-y-3 border-focus/40">
				<h2 className="h2 text-[#b8432a]">Delete learner</h2>
				<p className="text-sm text-ink-soft">
					This permanently deletes {student.displayName}'s profile and everything stored about them:
				</p>
				<ul className="list-disc space-y-1 pl-5 text-sm text-ink-soft">
					<li>lessons, answers and Nova chat messages</li>
					<li>progress, mastery history and review schedule</li>
					<li>worksheet checks</li>
				</ul>
				<p className="text-sm text-ink-soft">
					It cannot be undone. Export the data first if you want a copy. Type <strong>{student.displayName}</strong> to
					confirm.
				</p>
				<div className="flex flex-wrap gap-2">
					<input
						className="input max-w-xs"
						aria-label="Confirm learner name"
						value={confirmName}
						onChange={(e) => setConfirmName(e.target.value)}
					/>
					<button
						type="button"
						className="btn-danger"
						disabled={confirmName !== student.displayName || remove.pending}
						onClick={() => void remove.run()}
					>
						Delete learner
					</button>
				</div>
				<ErrorBox error={remove.error} />
			</section>
		</div>
	);
}
