const UNITS: Record<string, number> = {
	zero: 0,
	nought: 0,
	oh: 0,
	one: 1,
	two: 2,
	three: 3,
	four: 4,
	five: 5,
	six: 6,
	seven: 7,
	eight: 8,
	nine: 9,
	ten: 10,
	eleven: 11,
	twelve: 12,
	thirteen: 13,
	fourteen: 14,
	fifteen: 15,
	sixteen: 16,
	seventeen: 17,
	eighteen: 18,
	nineteen: 19,
};

const TENS: Record<string, number> = {
	twenty: 20,
	thirty: 30,
	forty: 40,
	fifty: 50,
	sixty: 60,
	seventy: 70,
	eighty: 80,
	ninety: 90,
};

const SCALES: Record<string, number> = { thousand: 1_000, million: 1_000_000 };

const HOMOPHONES: Record<string, string> = { to: "two", too: "two", for: "four", won: "one", ate: "eight" };

export function toSpeech(text: string): string {
	return text
		.replace(/=\s*\?/g, " equals what?")
		.replace(/☐|_{3,}/g, " what number ")
		.replace(/×/g, " times ")
		.replace(/÷/g, " divided by ")
		.replace(/\s[−-]\s/g, " minus ")
		.replace(/\+/g, " plus ")
		.replace(/=/g, " equals ")
		.replace(/\s+/g, " ")
		.trim();
}

function digitValue(token: string): number | null {
	if (token in UNITS && UNITS[token] < 10) return UNITS[token];
	if (/^\d$/.test(token)) return Number(token);
	return null;
}

export function parseSpokenNumber(transcript: string): string | null {
	const tokens = transcript
		.toLowerCase()
		.replace(/(\d),(?=\d{3}\b)/g, "$1")
		.replace(/[-–]/g, " ")
		.replace(/[^a-z0-9.\s]/g, " ")
		.split(/\s+/)
		.filter(Boolean);

	let started = false;
	let negative = false;
	let total = 0;
	let current = 0;
	let decimals = "";
	let inDecimals = false;

	for (let i = 0; i < tokens.length; i++) {
		const raw = tokens[i];
		const token = started && raw in HOMOPHONES ? HOMOPHONES[raw] : raw;
		const next = tokens[i + 1];

		if (inDecimals) {
			const d = digitValue(token);
			if (d === null) break;
			decimals += String(d);
			continue;
		}
		if (/^\d+(\.\d+)?$/.test(token)) {
			const [whole, frac] = token.split(".");
			current += Number(whole);
			if (frac) {
				decimals = frac;
				inDecimals = true;
			}
			started = true;
			continue;
		}
		if (!started && (token === "minus" || token === "negative")) {
			negative = true;
			continue;
		}
		if (token in UNITS) {
			current += UNITS[token];
			started = true;
			continue;
		}
		if (token in TENS) {
			current += TENS[token];
			started = true;
			continue;
		}
		if (token === "a" && !started && next && (next === "hundred" || next in SCALES)) {
			current = 1;
			started = true;
			continue;
		}
		if (token === "hundred") {
			current = (current || 1) * 100;
			started = true;
			continue;
		}
		if (token in SCALES) {
			total += (current || 1) * SCALES[token];
			current = 0;
			started = true;
			continue;
		}
		if (started && token === "and") continue;
		if (started && token === "point") {
			inDecimals = true;
			continue;
		}
		if (started) break;
	}

	if (!started) return null;
	const whole = total + current;
	const value = decimals ? `${whole}.${decimals}` : String(whole);
	return negative ? `-${value}` : value;
}

export function firstSpokenNumber(alternatives: string[]): string | null {
	for (const alt of alternatives) {
		const n = parseSpokenNumber(alt);
		if (n !== null) return n;
	}
	return null;
}

export function questionSpeech(item: { prompt: string; choices?: string[] | null }): string {
	if (!item.choices?.length) return item.prompt;
	return `${item.prompt} Is it ${item.choices.join(", or ")}?`;
}
