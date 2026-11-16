import { useEffect, useState } from "react";
import { ErrorBox, errorMessage, useAction } from "#/components/form";
import { formatDate } from "#/components/status";
import {
	checkWorksheetPhotoFn,
	deleteWorksheetCheckFn,
	listWorksheetChecksFn,
	reviewWorksheetCheckFn,
} from "#/server/functions";
import type { WorksheetCheckRecord } from "#/server/store/types";

const MAX_SIDE = 1600;

async function downscale(file: File): Promise<{ base64: string; mimeType: "image/jpeg" }> {
	const bitmap = await createImageBitmap(file);
	const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
	const canvas = document.createElement("canvas");
	canvas.width = Math.round(bitmap.width * scale);
	canvas.height = Math.round(bitmap.height * scale);
	canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
	bitmap.close();
	const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
	if (!blob) throw new Error("The photo could not be prepared.");
	const bytes = new Uint8Array(await blob.arrayBuffer());
	let binary = "";
	for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	return { base64: btoa(binary), mimeType: "image/jpeg" };
}

const VERDICT: Record<string, { label: string; tone?: string }> = {
	correct: { label: "Looks right", tone: "good" },
	incorrect: { label: "Check this", tone: "watch" },
	unchecked: { label: "Not checked" },
};

export function WorksheetChecks({
	studentId,
	objectives,
}: {
	studentId: string;
	objectives: { code: string; statement: string }[];
}) {
	const [enabled, setEnabled] = useState(false);
	const [checks, setChecks] = useState<WorksheetCheckRecord[]>([]);
	const [objectiveCode, setObjectiveCode] = useState(objectives[0]?.code ?? "");

	const [loadError, setLoadError] = useState<string | null>(null);
	useEffect(() => {
		let live = true;
		listWorksheetChecksFn({ data: { studentId } })
			.then((res) => {
				if (!live) return;
				setEnabled(res.enabled);
				setChecks(res.checks);
			})
			.catch((e: unknown) => live && setLoadError(errorMessage(e)));
		return () => {
			live = false;
		};
	}, [studentId]);

	const upload = useAction(async (file: File) => {
		const { base64, mimeType } = await downscale(file);
		const check = await checkWorksheetPhotoFn({ data: { studentId, objectiveCode, mimeType, imageBase64: base64 } });
		setChecks((c) => [check, ...c]);
	});

	if (!enabled && checks.length === 0) return null;

	return (
		<section className="card space-y-4" data-testid="worksheet-checks">
			<div>
				<p className="meta">Paper to progress</p>
				<h2 className="mt-1 font-display text-xl">Worksheet photos</h2>
				<p className="mt-1 max-w-2xl text-sm text-soft">
					Take a photo of one page of written sums. The AI only reads the page; the app checks the arithmetic. Reading
					handwriting from a photo is approximate, so please review each result. Nothing here changes progress. The
					photo itself is not stored.
				</p>
			</div>
			{enabled && (
				<div className="flex flex-wrap items-center gap-2">
					<select
						className="input max-w-md"
						aria-label="Objective"
						value={objectiveCode}
						onChange={(e) => setObjectiveCode(e.target.value)}
					>
						{objectives.map((o) => (
							<option key={o.code} value={o.code}>
								{o.code} · {o.statement.slice(0, 70)}
							</option>
						))}
					</select>
					<label className={`btn ${upload.pending ? "pointer-events-none opacity-60" : ""}`}>
						{upload.pending ? "Reading the photo…" : "Check a worksheet photo"}
						<input
							type="file"
							accept="image/jpeg,image/png,image/webp"
							capture="environment"
							className="sr-only"
							disabled={upload.pending}
							onChange={(e) => {
								const file = e.target.files?.[0];
								e.target.value = "";
								if (file) void upload.run(file);
							}}
						/>
					</label>
				</div>
			)}
			<ErrorBox error={upload.error ?? loadError} />
			{checks.map((c) => (
				<CheckCard
					key={c.id}
					check={c}
					onChange={(next) => setChecks((all) => all.map((x) => (x.id === next.id ? next : x)))}
					onDelete={() => setChecks((all) => all.filter((x) => x.id !== c.id))}
				/>
			))}
		</section>
	);
}

function CheckCard({
	check,
	onChange,
	onDelete,
}: {
	check: WorksheetCheckRecord;
	onChange: (c: WorksheetCheckRecord) => void;
	onDelete: () => void;
}) {
	const [answers, setAnswers] = useState(check.items.map((i) => i.childAnswer));
	const [note, setNote] = useState(check.parentNote ?? "");
	const review = useAction(async () => {
		const corrections = answers
			.map((childAnswer, index) => ({ index, childAnswer }))
			.filter((c) => c.childAnswer !== check.items[c.index]?.childAnswer);
		onChange(await reviewWorksheetCheckFn({ data: { checkId: check.id, corrections, parentNote: note || null } }));
	});
	const remove = useAction(async () => {
		await deleteWorksheetCheckFn({ data: { checkId: check.id } });
		onDelete();
	});

	return (
		<article className="space-y-3 border-t border-line pt-4 text-sm" data-testid="worksheet-check">
			<p className="meta">
				{formatDate(check.createdAt)} · {check.objectiveCode} ·{" "}
				{check.status === "reviewed" ? "Reviewed by a parent" : "Waiting for parent review"}
			</p>
			{check.imageQuality !== "good" && (
				<p className="notice">
					The photo was {check.imageQuality}. Results are less reliable; try a sharper, well-lit photo.
				</p>
			)}
			{check.flags.length > 0 && (
				<p className="notice">
					The page contained text that looked like instructions to the AI. It was ignored and the handwriting note was
					hidden.
				</p>
			)}
			{check.items.length === 0 ? (
				<p className="text-soft">No questions could be read on this photo.</p>
			) : (
				<div className="overflow-x-auto">
					<table className="data-table">
						<thead>
							<tr>
								<th>Question (as read)</th>
								<th>Answer (as read)</th>
								<th>Result</th>
							</tr>
						</thead>
						<tbody>
							{check.items.map((item, i) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: items are a fixed, ordered transcription without ids
								<tr key={`${check.id}-${i}`}>
									<td className="font-mono">{item.question}</td>
									<td>
										<input
											className="input w-24 py-1"
											aria-label={`Answer ${i + 1}`}
											value={answers[i] ?? ""}
											maxLength={60}
											onChange={(e) => setAnswers((a) => a.map((v, j) => (j === i ? e.target.value : v)))}
										/>
										{item.legibility !== "clear" && !item.editedByParent && (
											<span className="ml-1 font-mono text-[11px] text-[#8a4a0a]">{item.legibility}</span>
										)}
									</td>
									<td>
										<span className="badge" data-tone={VERDICT[item.verdict]?.tone}>
											{VERDICT[item.verdict]?.label}
										</span>
										{item.expected && <span className="ml-1 font-mono text-xs text-muted">({item.expected})</span>}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
			{check.handwriting.note && (
				<p className="text-soft">
					Handwriting (approximate, {check.handwriting.confidence} confidence): {check.handwriting.note}
				</p>
			)}
			<div className="flex flex-wrap gap-2">
				<input
					className="input max-w-md"
					placeholder="Parent note (optional)"
					aria-label="Parent note"
					maxLength={500}
					value={note}
					onChange={(e) => setNote(e.target.value)}
				/>
				<button type="button" className="btn-secondary" disabled={review.pending} onClick={() => void review.run()}>
					{check.status === "reviewed" ? "Update review" : "Mark as reviewed"}
				</button>
				<button type="button" className="btn-secondary" disabled={remove.pending} onClick={() => void remove.run()}>
					Delete
				</button>
			</div>
			<ErrorBox error={review.error ?? remove.error} />
		</article>
	);
}
