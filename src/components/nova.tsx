import { NOVA_IMAGE, NOVA_LABEL, type NovaState } from "./nova-state";

export type { NovaState } from "./nova-state";

type NovaProps = {
	state?: NovaState;
	size?: number;
	animated?: boolean;
	label?: string;
	className?: string;
	priority?: boolean;
};

export function Nova({ state = "ready", size = 160, animated = true, label, className, priority }: NovaProps) {
	return (
		<img
			src={NOVA_IMAGE[state]}
			width={size}
			height={size}
			alt={label ?? NOVA_LABEL[state]}
			data-nova-state={state}
			decoding="async"
			loading={priority ? "eager" : "lazy"}
			draggable={false}
			className={["nova", animated && "animate-nova-float", className].filter(Boolean).join(" ")}
		/>
	);
}
