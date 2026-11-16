import { FLIGHT_STEPS } from "./learning-map";

export function FlightPlan({ current }: { current: number }) {
	return (
		<ol aria-label="Flight plan" className="flight-plan" data-testid="flight-plan">
			{FLIGHT_STEPS.map((label, i) => {
				const state = i < current ? "done" : i === current ? "current" : "next";
				return (
					<li
						key={label}
						className="flight-step"
						data-state={state}
						data-solo={i === FLIGHT_STEPS.length - 1 || undefined}
						aria-current={state === "current" ? "step" : undefined}
					>
						<span aria-hidden="true" className="flight-marker" />
						<span className="flight-label">
							{label}
							<span className="sr-only">{state === "done" ? " (done)" : state === "next" ? " (next)" : ""}</span>
						</span>
					</li>
				);
			})}
		</ol>
	);
}
