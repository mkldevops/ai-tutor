import { useState } from "react";
import { setStudentVoiceFn } from "#/server/functions";
import { ErrorBox, useAction } from "./form";

export function VoiceSettings({
	studentId,
	displayName,
	enabled,
}: {
	studentId: string;
	displayName: string;
	enabled: boolean;
}) {
	const [on, setOn] = useState(enabled);
	const save = useAction(async (next: boolean) => {
		setOn(next);
		try {
			const res = await setStudentVoiceFn({ data: { studentId, enabled: next } });
			setOn(res.voice);
		} catch (e) {
			setOn(!next);
			throw e;
		}
	});

	return (
		<section className="card space-y-3" data-testid="voice-settings">
			<div>
				<h2 className="h2">Voice (pilot)</h2>
				<p className="mt-1 text-sm text-soft">
					Nova reads questions and feedback aloud, and {displayName} can say an answer instead of typing it. Speech is
					handled by this browser. Nothing is recorded, uploaded or stored. Speaking an answer only appears on devices
					that can recognise speech on the device itself; typing always works.
				</p>
			</div>
			<label className="flex items-center gap-3 text-sm">
				<input
					type="checkbox"
					className="size-5"
					checked={on}
					disabled={save.pending}
					onChange={(e) => void save.run(e.target.checked)}
				/>
				Use voice in lessons
			</label>
			<ErrorBox error={save.error} />
		</section>
	);
}
