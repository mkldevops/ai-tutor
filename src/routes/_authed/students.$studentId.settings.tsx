import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { ErrorBox, useAction } from "#/components/form";
import { useProgress } from "#/components/student-progress";
import { VoiceSettings } from "#/components/voice-settings";
import { deleteStudentFn, exportStudentFn } from "#/server/functions";

export const Route = createFileRoute("/_authed/students/$studentId/settings")({
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
		await deleteStudentFn({ data: { studentId: student.id, confirm: true } });
		await router.navigate({ to: "/dashboard" });
	});

	return (
		<div className="space-y-6">
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
					Delete this learner and all their sessions, answers and progress. This cannot be undone. Type{" "}
					<strong>{student.displayName}</strong> to confirm.
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
