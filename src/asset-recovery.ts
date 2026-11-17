export const RELOAD_KEY = "asset-recovery-reload";
export const RELOAD_COOLDOWN_MS = 30_000;

export function installAssetRecovery(key: string, cooldownMs: number) {
	const reloadOnce = () => {
		try {
			const last = Number(sessionStorage.getItem(key) ?? 0);
			if (Date.now() - last < cooldownMs) return;
			sessionStorage.setItem(key, String(Date.now()));
		} catch {
			return;
		}
		location.reload();
	};
	window.addEventListener(
		"error",
		(event) => {
			const target = event.target;
			const url =
				target instanceof HTMLLinkElement ? target.href : target instanceof HTMLScriptElement ? target.src : "";
			if (url.includes("/assets/")) reloadOnce();
		},
		true,
	);
	window.addEventListener("vite:preloadError", (event) => {
		event.preventDefault();
		reloadOnce();
	});
}

export const assetRecoveryScript = `(${installAssetRecovery.toString()})(${JSON.stringify(RELOAD_KEY)},${RELOAD_COOLDOWN_MS});`;
