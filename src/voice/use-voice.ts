import { useCallback, useEffect, useRef, useState } from "react";
import { speakFn } from "#/server/functions";
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
	const [speaking, setSpeaking] = useState(false);
	const remote = useRef(true);
	const clips = useRef(new Map<string, string>());
	const audio = useRef<HTMLAudioElement | null>(null);
	const turn = useRef(0);

	useEffect(() => {
		setSupported(enabled && typeof window !== "undefined" && ("speechSynthesis" in window || "Audio" in window));
	}, [enabled]);

	const silence = useCallback(() => {
		turn.current++;
		audio.current?.pause();
		audio.current = null;
		if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
	}, []);

	useEffect(() => {
		if (!supported) return;
		return silence;
	}, [supported, silence]);

	const browserSpeak = useCallback((spoken: string) => {
		if (!("speechSynthesis" in window)) {
			setSpeaking(false);
			return;
		}
		const synth = window.speechSynthesis;
		const utterance = new SpeechSynthesisUtterance(spoken);
		utterance.lang = LANG;
		utterance.rate = 0.95;
		const voice = synth.getVoices().find((v) => v.lang === LANG);
		if (voice) utterance.voice = voice;
		utterance.onstart = () => setSpeaking(true);
		utterance.onend = () => setSpeaking(false);
		utterance.onerror = () => setSpeaking(false);
		synth.speak(utterance);
	}, []);

	const remoteClip = useCallback(async (spoken: string): Promise<string | null> => {
		if (!remote.current) return null;
		const known = clips.current.get(spoken);
		if (known) return known;
		const res = await speakFn({ data: { text: spoken } }).catch(() => null);
		if (!res?.audio) {
			remote.current = false;
			return null;
		}
		const src = `data:audio/mpeg;base64,${res.audio}`;
		clips.current.set(spoken, src);
		return src;
	}, []);

	const speak = useCallback(
		async (text: string) => {
			if (!supported || !text.trim()) return;
			silence();
			const mine = turn.current;
			const spoken = toSpeech(text);
			const src = spoken.length <= 600 ? await remoteClip(spoken) : null;
			if (mine !== turn.current) return;
			if (src) {
				const el = new Audio(src);
				audio.current = el;
				el.onplaying = () => setSpeaking(true);
				el.onended = () => setSpeaking(false);
				el.onerror = () => setSpeaking(false);
				try {
					await el.play();
					return;
				} catch {
					if (mine !== turn.current) return;
					audio.current = null;
				}
			}
			browserSpeak(spoken);
		},
		[supported, silence, remoteClip, browserSpeak],
	);

	const stop = useCallback(() => {
		silence();
		setSpeaking(false);
	}, [silence]);

	return { supported, speaking, speak, stop };
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
