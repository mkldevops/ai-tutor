import { useRouter } from "@tanstack/react-router";
import { ErrorBox, Field, useAction } from "#/components/form";
import { setParentPinFn } from "#/server/functions";

const PIN_FIELD = {
	inputMode: "numeric",
	pattern: "\\d{4,8}",
	minLength: 4,
	maxLength: 8,
	autoComplete: "off",
} as const;

export function SetPinForm({ submitLabel, onDone }: { submitLabel: string; onDone?: () => Promise<void> | void }) {
	const router = useRouter();
	const action = useAction(async (form: FormData) => {
		const pin = String(form.get("pin"));
		if (pin !== String(form.get("confirmPin"))) throw new Error("The two PINs do not match.");
		await setParentPinFn({ data: { password: String(form.get("password")), pin } });
		await router.invalidate();
		await onDone?.();
	});
	return (
		<form
			className="space-y-3"
			onSubmit={(e) => {
				e.preventDefault();
				const form = e.currentTarget;
				void action.run(new FormData(form)).then(() => form.reset());
			}}
		>
			<Field label="Account password" name="password" type="password" autoComplete="current-password" required />
			<Field label="New parent PIN (4 to 8 digits)" name="pin" type="password" {...PIN_FIELD} required />
			<Field label="Repeat the PIN" name="confirmPin" type="password" {...PIN_FIELD} required />
			<ErrorBox error={action.error} />
			<button className="btn" type="submit" disabled={action.pending}>
				{action.pending ? "Saving…" : submitLabel}
			</button>
		</form>
	);
}

export { PIN_FIELD };
