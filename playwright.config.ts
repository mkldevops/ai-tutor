import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const DATA_BACKEND = process.env.E2E_DATA_BACKEND ?? "memory";

if (DATA_BACKEND === "appwrite") process.loadEnvFile(".env");

export default defineConfig({
	testDir: "./e2e",
	timeout: 120_000,
	fullyParallel: false,
	workers: 1,
	reporter: [["list"]],
	use: {
		baseURL: `http://localhost:${PORT}`,
		trace: "retain-on-failure",
	},
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
	webServer: {
		command: `pnpm exec vite dev --port ${PORT} --strictPort`,
		url: `http://localhost:${PORT}`,
		reuseExistingServer: false,
		timeout: 120_000,
		env: { DATA_BACKEND, AI_ENABLED: "false" },
	},
});
