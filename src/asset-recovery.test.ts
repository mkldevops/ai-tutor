import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assetRecoveryScript, installAssetRecovery } from "./asset-recovery";

class FakeLink {
	constructor(public href: string) {}
}
class FakeScript {
	constructor(public src: string) {}
}

type Listener = (event: { target?: unknown; preventDefault?: () => void }) => void;

let listeners: Record<string, Listener>;
let store: Map<string, string>;
let reload: ReturnType<typeof vi.fn>;

beforeEach(() => {
	listeners = {};
	store = new Map();
	reload = vi.fn();
	vi.stubGlobal("HTMLLinkElement", FakeLink);
	vi.stubGlobal("HTMLScriptElement", FakeScript);
	vi.stubGlobal("window", { addEventListener: (type: string, fn: Listener) => (listeners[type] = fn) });
	vi.stubGlobal("sessionStorage", {
		getItem: (k: string) => store.get(k) ?? null,
		setItem: (k: string, v: string) => store.set(k, v),
	});
	vi.stubGlobal("location", { reload });
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe("installAssetRecovery", () => {
	it("reloads once when a build asset fails to load", () => {
		installAssetRecovery("k", 30_000);
		listeners.error({ target: new FakeLink("https://x/assets/styles-abc.css") });
		listeners.error({ target: new FakeScript("https://x/assets/index-abc.js") });
		expect(reload).toHaveBeenCalledTimes(1);
	});

	it("reloads again once the cooldown has passed", () => {
		vi.useFakeTimers();
		installAssetRecovery("k", 30_000);
		listeners.error({ target: new FakeLink("https://x/assets/a.css") });
		vi.advanceTimersByTime(30_001);
		listeners.error({ target: new FakeLink("https://x/assets/a.css") });
		expect(reload).toHaveBeenCalledTimes(2);
	});

	it("ignores failures outside the build assets", () => {
		installAssetRecovery("k", 30_000);
		listeners.error({ target: new FakeLink("https://fonts.googleapis.com/css2") });
		listeners.error({ target: {} });
		expect(reload).not.toHaveBeenCalled();
	});

	it("reloads on a failed lazy chunk import", () => {
		installAssetRecovery("k", 30_000);
		const preventDefault = vi.fn();
		listeners["vite:preloadError"]({ preventDefault });
		expect(preventDefault).toHaveBeenCalled();
		expect(reload).toHaveBeenCalledTimes(1);
	});

	it("does not loop when session storage is unavailable", () => {
		vi.stubGlobal("sessionStorage", {
			getItem: () => {
				throw new Error("blocked");
			},
		});
		installAssetRecovery("k", 30_000);
		listeners.error({ target: new FakeLink("https://x/assets/a.css") });
		expect(reload).not.toHaveBeenCalled();
	});
});

describe("assetRecoveryScript", () => {
	it("runs standalone and installs the listeners", () => {
		new Function(assetRecoveryScript)();
		expect(Object.keys(listeners)).toEqual(["error", "vite:preloadError"]);
	});
});
