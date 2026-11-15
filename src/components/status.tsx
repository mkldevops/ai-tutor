import type { CompetencyStatus } from "#/domain/types";

const LABELS: Record<CompetencyStatus, { label: string; className: string }> = {
	not_started: { label: "Not started", className: "bg-slate-100 text-slate-700" },
	emerging: { label: "Emerging", className: "bg-amber-100 text-amber-800" },
	developing: { label: "Developing", className: "bg-sky-100 text-sky-800" },
	secure: { label: "Secure", className: "bg-emerald-100 text-emerald-800" },
	mastered: { label: "Mastered", className: "bg-indigo-100 text-indigo-800" },
	needs_review: { label: "Needs review", className: "bg-rose-100 text-rose-800" },
};

export function StatusBadge({ status }: { status: CompetencyStatus }) {
	const s = LABELS[status];
	return (
		<span className={`badge ${s.className}`} data-testid="status-badge" data-status={status}>
			{s.label}
		</span>
	);
}

export function formatDate(iso: string | null | undefined): string {
	if (!iso) return "—";
	return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
