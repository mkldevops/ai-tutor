import { useCallback, useEffect, useRef, useState } from "react";
import { toSpeech } from "./spoken";

const LANG = "en-GB";
const LOCAL = { langs: [LANG], processLocally: true };

type Availability = "available" | "downloadable" | "downloading" | "unavailable";

type RecognitionAlternative = { transcript: string };
type RecognitionEvent = { results: ArrayLike<ArrayLike<RecognitionAlternative>> };
type RecognitionErrorEvent = { error: string };

type Recognition = {
	lang: string;
	processLocally: boolean;
	interimResults: boolean;
	maxAlternatives: number;
	onresult: ((e: RecognitionEvent) => void) | null;
	onerror: ((e: RecognitionErrorEvent) => void) | null;
	onend: (() => void) | null;
	start: () => void;
	abort: () => void;
};

type RecognitionCtor = {
	new (): Recognition;
	available?: (o: typeof LOCAL) => Promise<Availability>;
	install?: (o: typeof LOCAL) => Promise<boolean>;
};

function recognitionCtor(): RecognitionCtor | null {
	if (typeof window === "undefined") return null;
	const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
	return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useSpeaker(enabled: boolean) {
	const [supported, setSupported] = useState(false);

	useEffect(() => {
		setSupported(enabled && typeof window !== "undefined" && "speechSynthesis" in window);
	}, [enabled]);

	useEffect(() => {
		if (!supported) return;
		return () => window.speechSynthesis.cancel();
	}, [supported]);

	const speak = useCallback(
		(text: string) => {
			if (!supported || !text.trim()) return;
			const synth = window.speechSynthesis;
			synth.cancel();
			const utterance = new SpeechSynthesisUtterance(toSpeech(text));
			utterance.lang = LANG;
			utterance.rate = 0.95;
			const voice = synth.getVoices().find((v) => v.lang === LANG);
			if (voice) utterance.voice = voice;
			synth.speak(utterance);
		},
		[supported],
	);

	const stop = useCallback(() => {
		if (supported) window.speechSynthesis.cancel();
	}, [supported]);

	return { supported, speak, stop };
}

export type ListenerStatus =
	| "off"
	| "checking"
	| "ready"
	| "downloadable"
	| "downloading"
	| "listening"
	| "unavailable";

export function useListener(enabled: boolean, onResult: (alternatives: string[]) => void) {
	const [status, setStatus] = useState<ListenerStatus>("off");
	const [error, setError] = useState<string | null>(null);
	const recognition = useRef<Recognition | null>(null);
	const handler = useRef(onResult);
	handler.current = onResult;

	useEffect(() => {
		if (!enabled) {
			setStatus("off");
			return;
		}
		const ctor = recognitionCtor();
		if (!ctor?.available) {
			setStatus("unavailable");
			return;
		}
		let cancelled = false;
		setStatus("checking");
		ctor
			.available(LOCAL)
			.then((a) => {
				if (!cancelled) setStatus(a === "available" ? "ready" : a);
			})
			.catch(() => {
				if (!cancelled) setStatus("unavailable");
			});
		return () => {
			cancelled = true;
			recognition.current?.abort();
		};
	}, [enabled]);

	const install = useCallback(async () => {
		const ctor = recognitionCtor();
		if (!ctor?.install) return;
		setError(null);
		setStatus("downloading");
		const ok = await ctor.install(LOCAL).catch(() => false);
		setStatus(ok ? "ready" : "downloadable");
		if (!ok) setError("The speech pack could not be downloaded. Try again later.");
	}, []);

	const listen = useCallback(() => {
		const ctor = recognitionCtor();
		if (!ctor || status !== "ready") return;
		setError(null);
		const rec = new ctor();
		rec.lang = LANG;
		rec.processLocally = true;
		rec.interimResults = false;
		rec.maxAlternatives = 3;
		rec.onresult = (e) => {
			const first = e.results[0];
			if (!first) return;
			handler.current(Array.from(first, (a) => a.transcript));
		};
		rec.onerror = (e) => {
			if (e.error === "no-speech" || e.error === "aborted") return;
			setError(
				e.error === "not-allowed"
					? "The microphone is blocked. You can still type your answer."
					: "I could not hear that. Try again or type your answer.",
			);
		};
		rec.onend = () => {
			recognition.current = null;
			setStatus("ready");
		};
		recognition.current = rec;
		setStatus("listening");
		try {
			rec.start();
		} catch {
			recognition.current = null;
			setStatus("ready");
			setError("I could not start listening. You can still type your answer.");
		}
	}, [status]);

	const stop = useCallback(() => recognition.current?.abort(), []);

	return { status, error, install, listen, stop };
}
