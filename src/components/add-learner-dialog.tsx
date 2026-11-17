import { useRouter } from "@tanstack/react-router";
import { useRef } from "react";
import { ErrorBox, Field, useAction } from "#/components/form";
import { Nova } from "#/components/nova";
import { createStudentFn } from "#/server/functions";

export function AddLearnerDialog() {
	const router = useRouter();
	const dialogRef = useRef<HTMLDialogElement>(null);
	const formRef = useRef<HTMLFormElement>(null);
	const close = () => dialogRef.current?.close();
	const create = useAction(async (form: HTMLFormElement) => {
		const data = new FormData(form);
		await createStudentFn({
			data: {
				displayName: String(data.get("displayName")),
				yearGroup: Number(data.get("yearGroup")) as 3 | 5,
			},
		});
		form.reset();
		close();
		await router.invalidate();
	});

	return (
		<>
			<button
				type="button"
				className="btn add-trigger"
				aria-label="Add a learner"
				aria-haspopup="dialog"
				onClick={() => {
					formRef.current?.reset();
					dialogRef.current?.showModal();
					formRef.current?.querySelector<HTMLInputElement>("input[name=displayName]")?.focus();
				}}
			>
				<span aria-hidden="true" className="add-plus">
					+
				</span>
				<span className="hidden sm:inline">Add a learner</span>
			</button>
			<dialog
				ref={dialogRef}
				className="modal"
				aria-labelledby="add-learner-title"
				onClick={(e) => {
					if (e.target === e.currentTarget) close();
				}}
				onKeyDown={(e) => {
					if (e.key === "Escape") close();
				}}
			>
				<div className="modal-body space-y-4">
					<div className="flex items-start gap-3">
						<Nova state="wave" size={72} className="modal-nova w-16 shrink-0" />
						<div className="min-w-0 flex-1">
							<h2 id="add-learner-title" className="h2 mb-1">
								Add a learner
							</h2>
							<p className="text-sm text-ink-soft">
								Use a first name or nickname only. No full names or school details are needed.
							</p>
						</div>
						<button type="button" className="modal-close" aria-label="Close" onClick={close}>
							<span aria-hidden="true">×</span>
						</button>
					</div>
					<form
						ref={formRef}
						className="space-y-4"
						onSubmit={(e) => {
							e.preventDefault();
							void create.run(e.currentTarget);
						}}
					>
						<Field label="Display name" name="displayName" required maxLength={40} />
						<label className="block">
							<span className="label">Year group</span>
							<select name="yearGroup" className="input" defaultValue="3">
								<option value="3">Year 3</option>
								<option value="5">Year 5</option>
							</select>
						</label>
						<ErrorBox error={create.error} />
						<div className="flex justify-end gap-2">
							<button type="button" className="btn-secondary" onClick={close}>
								Cancel
							</button>
							<button className="btn" type="submit" disabled={create.pending}>
								{create.pending ? "Adding…" : "Add learner"}
							</button>
						</div>
					</form>
				</div>
			</dialog>
		</>
	);
}
