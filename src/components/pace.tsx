import type { Pace, PaceStatus } from "#/learning-engine/pace";
import { formatDate } from "./status";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const PACE_LABEL: Record<PaceStatus, string> = {
	on_track: "On track",
	behind: "Behind",
	paused: "Paused",
	complete: "Complete",
};

const PACE_TONE: Record<PaceStatus, string | undefined> = {
	on_track: "good",
	behind: "watch",
	paused: undefined,
	complete: "good",
};

export function paceLine(pace: Pace): string | null {
	const week = `${plural(pace.missionsThisWeek, "mission")} in the last 7 days, target ${pace.target} a week`;
	switch (pace.status) {
		case "complete":
			return null;
		case "paused":
			return "Programme paused: pace is not tracked.";
		case "on_track":
			return `On track: ${week}.`;
		case "behind":
			return `Behind: ${week}.`;
	}
}

export function projectionLine(pace: Pace): string | null {
	if (!pace.projectedEndAt) return null;
	const date = formatDate(pace.projectedEndAt);
	if (pace.basis === "target") {
		return `At ${plural(pace.target, "mission")} a week, the programme would be finished around ${date} (estimate).`;
	}
	return `At this pace, the programme should be finished around ${date} (estimate).`;
}

export function PaceBadge({ pace }: { pace: Pace }) {
	if (pace.status === "complete") return null;
	return (
		<span className="badge" data-tone={PACE_TONE[pace.status]} data-testid="pace-status" data-pace={pace.status}>
			{PACE_LABEL[pace.status]}
		</span>
	);
}
