import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, copyFile, readFile, writeFile } from "node:fs/promises";

const [credentialsPath, envPath, examplePath, endpoint, projectId] = process.argv.slice(2);

const credentials = Object.fromEntries(
	(await readFile(credentialsPath, "utf8"))
		.trim()
		.split("\n")
		.map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
);

async function request(path, body, cookie) {
	const response = await fetch(`${endpoint}${path}`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"x-appwrite-project": "console",
			...(cookie ? { cookie } : {}),
		},
		body: JSON.stringify(body),
	});
	const payload = await response.json().catch(() => ({}));
	if (!response.ok) {
		if (response.status === 409 || payload.type === "user_console_count_exceeded") return { duplicate: true, payload };
		throw new Error(`${path}: ${response.status} ${payload.type ?? ""} ${payload.message ?? ""}`);
	}
	return { payload, cookie: response.headers.getSetCookie?.().find((c) => c.startsWith("a_session_console="))?.split(";")[0] };
}

await request("/account", {
	userId: "ai-tutor-admin",
	email: credentials.ADMIN_EMAIL,
	password: credentials.ADMIN_PASSWORD,
	name: "AI Tutor admin",
});
const session = await request("/account/sessions/email", {
	email: credentials.ADMIN_EMAIL,
	password: credentials.ADMIN_PASSWORD,
});
const cookie = session.cookie;
if (!cookie) throw new Error("Console session returned no cookie.");

await request("/teams", { teamId: "ai-tutor-team", name: "AI Tutor" }, cookie);
await request("/projects", { projectId, name: `AI Tutor (${projectId})`, teamId: "ai-tutor-team", region: "default" }, cookie);

const key = await request(
	`/projects/${projectId}/keys`,
	{
		keyId: `server-${randomBytes(6).toString("hex")}`,
		name: "AI Tutor server",
		scopes: [
			"users.read",
			"users.write",
			"sessions.write",
			"databases.read",
			"databases.write",
			"tables.read",
			"tables.write",
			"columns.read",
			"columns.write",
			"indexes.read",
			"indexes.write",
			"rows.read",
			"rows.write",
			"buckets.read",
			"buckets.write",
			"files.read",
			"files.write",
		],
	},
	cookie,
);
if (!key.payload?.secret) throw new Error("API key was not created.");

if (!existsSync(envPath)) await copyFile(examplePath, envPath);
const values = {
	DATA_BACKEND: "appwrite",
	APPWRITE_ENDPOINT: endpoint,
	APPWRITE_PROJECT_ID: projectId,
	APPWRITE_API_KEY: key.payload.secret,
	APPWRITE_DATABASE_ID: "ai_tutor",
};
const lines = (await readFile(envPath, "utf8")).split("\n");
for (const [name, value] of Object.entries(values)) {
	const index = lines.findIndex((line) => line.startsWith(`${name}=`));
	if (index === -1) lines.push(`${name}=${value}`);
	else lines[index] = `${name}=${value}`;
}
await writeFile(envPath, lines.join("\n"), { mode: 0o600 });
await chmod(envPath, 0o600);
console.log(`Project ${projectId} ready at ${endpoint}; ${envPath} updated.`);
