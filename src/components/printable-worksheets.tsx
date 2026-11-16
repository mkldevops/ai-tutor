import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

export function PrintableWorksheets({
	studentId,
	objectives,
}: {
	studentId: string;
	objectives: { code: string; statement: string; yearGroup: number }[];
}) {
	const navigate = useNavigate();
	const [objective, setObjective] = useState(objectives[0]?.code ?? "");
	const [difficulty, setDifficulty] = useState<"auto" | "1" | "2" | "3">("auto");
	const [count, setCount] = useState(10);

	if (objectives.length === 0) return null;

	return (
		<section className="card space-y-4" data-testid="printable-worksheets">
			<div>
				<p className="meta">Off-screen practice</p>
				<h2 className="mt-1 font-display text-xl">Printable worksheets</h2>
				<p className="mt-1 max-w-2xl text-sm text-soft">
					Make a paper sheet of practice questions and a separate answer key. "Auto" picks the level from current
					progress. Earlier-year objectives are included for warm-up.
				</p>
			</div>
			<form
				className="flex flex-wrap items-end gap-2"
				onSubmit={(e) => {
					e.preventDefault();
					void navigate({
						to: "/print/$studentId",
						params: { studentId },
						search: { objective, seed: crypto.randomUUID(), count, difficulty, variant: "worksheet" },
					});
				}}
			>
				<select
					className="input max-w-md"
					aria-label="Worksheet objective"
					value={objective}
					onChange={(e) => setObjective(e.target.value)}
				>
					{objectives.map((o) => (
						<option key={o.code} value={o.code}>
							Y{o.yearGroup} · {o.statement.slice(0, 70)}
						</option>
					))}
				</select>
				<select
					className="input w-36"
					aria-label="Level"
					value={difficulty}
					onChange={(e) => setDifficulty(e.target.value as typeof difficulty)}
				>
					<option value="auto">Level: auto</option>
					<option value="1">Level 1 (easier)</option>
					<option value="2">Level 2</option>
					<option value="3">Level 3 (harder)</option>
				</select>
				<select
					className="input w-36"
					aria-label="Number of questions"
					value={count}
					onChange={(e) => setCount(Number(e.target.value))}
				>
					{[6, 10, 16, 20].map((n) => (
						<option key={n} value={n}>
							{n} questions
						</option>
					))}
				</select>
				<button type="submit" className="btn">
					Make worksheet
				</button>
			</form>
		</section>
	);
}
