import { useState } from "react";
import { setPaceTargetFn } from "#/server/functions";
import { ErrorBox, useAction } from "./form";

const TARGETS = Array.from({ length: 14 }, (_, i) => i + 1);

export function PaceSettings({
	studentId,
	displayName,
	target,
}: {
	studentId: string;
	displayName: string;
	target: number;
}) {
	const [value, setValue] = useState(target);
	const [saved, setSaved] = useState(false);
	const save = useAction(async (next: number) => {
		const previous = value;
		setValue(next);
		setSaved(false);
		try {
			const res = await setPaceTargetFn({ data: { studentId, paceTarget: next } });
			setValue(res.paceTarget);
			setSaved(true);
		} catch (e) {
			setValue(previous);
			throw e;
		}
	});

	return (
		<section className="card space-y-3" data-testid="pace-settings">
			<div>
				<h2 className="h2">Weekly pace</h2>
				<p className="mt-1 text-sm text-soft">
					How many missions a week you aim for. The Progress tab and the family dashboard compare {displayName}'s last 7
					days with this target and estimate when the programme will be finished. {displayName} never sees it.
				</p>
			</div>
			<label className="flex flex-wrap items-center gap-3 text-sm">
				Missions a week
				<select
					className="input w-24"
					value={value}
					disabled={save.pending}
					onChange={(e) => void save.run(Number(e.target.value))}
				>
					{TARGETS.map((n) => (
						<option key={n} value={n}>
							{n}
						</option>
					))}
				</select>
				{saved && !save.pending && <output className="text-ink-mute">Saved</output>}
			</label>
			<ErrorBox error={save.error} />
		</section>
	);
}
