import { useState } from "react";
import { setDailyNewStepCapFn } from "#/server/functions";
import { ErrorBox, useAction } from "./form";

export function DailyCapSettings({
	studentId,
	displayName,
	enabled,
}: {
	studentId: string;
	displayName: string;
	enabled: boolean;
}) {
	const [on, setOn] = useState(enabled);
	const [saved, setSaved] = useState(false);
	const save = useAction(async (next: boolean) => {
		setOn(next);
		setSaved(false);
		try {
			const res = await setDailyNewStepCapFn({ data: { studentId, enabled: next } });
			setOn(res.dailyNewStepCap);
			setSaved(true);
		} catch (e) {
			setOn(!next);
			throw e;
		}
	});

	return (
		<section className="card space-y-3" data-testid="daily-cap-settings" data-enabled={on}>
			<div>
				<h2 className="h2">One new step a day</h2>
				<p className="mt-1 text-sm text-soft">
					Once {displayName} secures a step, the next new step waits until tomorrow. Missions already started, review
					checks, rework and extra practice stay open. Days follow UTC.
				</p>
			</div>
			<label className="flex flex-wrap items-center gap-3 text-sm">
				<input
					type="checkbox"
					className="size-5"
					checked={on}
					disabled={save.pending}
					onChange={(e) => void save.run(e.target.checked)}
				/>
				Limit to one new step a day
				{saved && !save.pending && <output className="text-ink-mute">Saved</output>}
			</label>
			<ErrorBox error={save.error} />
		</section>
	);
}
