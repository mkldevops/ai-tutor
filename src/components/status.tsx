import type { CompetencyStatus } from "#/domain/types";

export const STATUS_LABELS: Record<CompetencyStatus, string> = {
	not_started: "Not started",
	emerging: "Emerging",
	developing: "Developing",
	secure: "Secure",
	mastered: "Mastered",
	needs_review: "Needs review",
};

export function StatusBadge({ status }: { status: CompetencyStatus }) {
	return (
		<span className="badge" data-testid="status-badge" data-status={status}>
			{STATUS_LABELS[status]}
		</span>
	);
}

export function formatDate(iso: string | null | undefined): string {
	if (!iso) return "—";
	return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function formatWeekday(iso: string): string {
	return new Date(iso).toLocaleDateString("en-GB", { weekday: "short" });
}
