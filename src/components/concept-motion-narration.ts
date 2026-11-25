export type MotionNarrationCallbacks = {
	onNarrate?: (text: string) => void;
	onPauseNarration?: () => void;
};

/** Read callbacks at the moment of interaction, never once per animation frame. */
export function createCaptionNarrator(readCallbacks: () => MotionNarrationCallbacks) {
	return {
		stop: () => readCallbacks().onPauseNarration?.(),
		hear: (caption: string) => {
			const callbacks = readCallbacks();
			callbacks.onPauseNarration?.();
			callbacks.onNarrate?.(caption);
		},
	};
}
