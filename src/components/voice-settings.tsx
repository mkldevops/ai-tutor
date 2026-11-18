import { useState } from "react";
import { setStudentVoiceFn } from "#/server/functions";
import { useListener } from "#/voice/use-voice";
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
					Nova reads questions and feedback aloud, and {displayName} can say an answer instead of typing it. To make
					Nova's voice, the lesson text is sent to our voice provider, ElevenLabs. {displayName}'s own voice stays on
					this device: it is never recorded, uploaded or stored. Speaking an answer only appears on devices that can
					recognise speech on the device itself; typing always works.
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
			{on && <DeviceSpeech />}
		</section>
	);
}

function DeviceSpeech() {
	const listener = useListener(true, () => {});
	const { status, error } = listener;
	if (status === "downloadable" || status === "downloading") {
		return (
			<div className="space-y-2 border-t pt-3" data-testid="speech-pack">
				<p className="text-sm text-soft">
					To speak answers, this device needs its speech pack. Download it once here, before the lesson.
				</p>
				<button
					type="button"
					className="btn-secondary"
					disabled={status === "downloading"}
					onClick={() => void listener.install()}
				>
					{status === "downloading" ? "Downloading…" : "Download the speech pack"}
				</button>
				{error && <p className="text-sm text-soft">{error}</p>}
			</div>
		);
	}
	if (status === "ready") {
		return <p className="border-t pt-3 text-sm text-soft">This device is ready for spoken answers.</p>;
	}
	return null;
}
