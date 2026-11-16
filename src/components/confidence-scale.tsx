const LEVELS = [1, 2, 3, 4, 5] as const;

export function ConfidenceScale({
	label,
	value,
	before,
	onChange,
}: {
	label: string;
	value?: number;
	before?: number;
	onChange: (value: number) => void;
}) {
	return (
		<fieldset className="space-y-3" data-testid="confidence">
			<legend className="mb-3 font-display text-2xl leading-tight">{label}</legend>
			<div className="flex gap-2">
				{LEVELS.map((n) => (
					<button
						key={n}
						type="button"
						className="confidence-step"
						aria-pressed={value === n}
						data-before={before === n || undefined}
						aria-label={`${n} of 5${n === 1 ? ", not sure yet" : n === 5 ? ", very sure" : ""}`}
						onClick={() => onChange(n)}
					>
						{n}
					</button>
				))}
			</div>
			<div className="flex max-w-[278px] justify-between text-xs text-muted">
				<span>Not sure yet</span>
				<span>Very sure</span>
			</div>
		</fieldset>
	);
}
