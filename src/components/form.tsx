import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { PARENT_LOCKED_MESSAGE } from "#/domain/parent-lock";

export function errorMessage(e: unknown): string {
	if (e instanceof Error) return e.message;
	return "Something went wrong.";
}

export function useAction<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const router = useRouter();
	const run = async (...args: A): Promise<R | undefined> => {
		setPending(true);
		setError(null);
		try {
			return await fn(...args);
		} catch (e) {
			if (errorMessage(e) === PARENT_LOCKED_MESSAGE) {
				await router.invalidate();
				return undefined;
			}
			setError(errorMessage(e));
			return undefined;
		} finally {
			setPending(false);
		}
	};
	return { run, pending, error, setError };
}

export function ErrorBox({ error }: { error: string | null }) {
	if (!error) return null;
	return (
		<p role="alert" className="error">
			{error}
		</p>
	);
}

export function Field({
	label,
	...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; name: string }) {
	return (
		<label className="block">
			<span className="label">{label}</span>
			<input className="input" {...props} />
		</label>
	);
}
