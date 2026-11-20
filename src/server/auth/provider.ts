import { randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { Account, Client, ID, Users } from "node-appwrite";

export type AuthUser = { id: string; email: string; name: string };
export type AuthResult = { user: AuthUser; sessionSecret: string };

export class AuthError extends Error {
	constructor(
		message: string,
		public code: "invalid_credentials" | "email_taken" | "weak_password" | "unknown",
	) {
		super(message);
	}
}

export interface AuthProvider {
	signUp(email: string, password: string, name: string): Promise<AuthResult>;
	signIn(email: string, password: string): Promise<AuthResult>;
	getUser(sessionSecret: string): Promise<AuthUser | null>;
	signOut(sessionSecret: string): Promise<void>;
	deleteUser(userId: string): Promise<void>;
}

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export function createMemoryAuth(): AuthProvider {
	const users = new Map<string, AuthUser & { salt: Buffer; hash: Buffer }>();
	const sessions = new Map<string, string>();
	const newSession = (user: AuthUser) => {
		const secret = randomBytes(32).toString("base64url");
		sessions.set(secret, user.id);
		return { user, sessionSecret: secret };
	};
	return {
		async signUp(email, password, name) {
			const key = email.toLowerCase();
			if ([...users.values()].some((u) => u.email === key))
				throw new AuthError("Email already registered", "email_taken");
			const salt = randomBytes(16);
			const hash = await scryptAsync(password, salt, 32);
			const user = { id: randomUUID().replace(/-/g, ""), email: key, name, salt, hash };
			users.set(user.id, user);
			return newSession({ id: user.id, email: key, name });
		},
		async signIn(email, password) {
			const user = [...users.values()].find((u) => u.email === email.toLowerCase());
			const hash = await scryptAsync(password, user?.salt ?? randomBytes(16), 32);
			if (!user || !timingSafeEqual(hash, user.hash)) {
				throw new AuthError("Invalid email or password", "invalid_credentials");
			}
			return newSession({ id: user.id, email: user.email, name: user.name });
		},
		async getUser(secret) {
			const id = sessions.get(secret);
			const user = id ? users.get(id) : undefined;
			return user ? { id: user.id, email: user.email, name: user.name } : null;
		},
		async signOut(secret) {
			sessions.delete(secret);
		},
		async deleteUser(userId) {
			users.delete(userId);
			for (const [secret, id] of sessions) if (id === userId) sessions.delete(secret);
		},
	};
}

export function createAppwriteAuth(opts: { endpoint: string; projectId: string; apiKey: string }): AuthProvider {
	const admin = () => new Client().setEndpoint(opts.endpoint).setProject(opts.projectId).setKey(opts.apiKey);
	const asSession = (secret: string) =>
		new Client().setEndpoint(opts.endpoint).setProject(opts.projectId).setSession(secret);

	const createSession = async (email: string, password: string): Promise<AuthResult> => {
		try {
			const session = await new Account(admin()).createEmailPasswordSession({ email, password });
			const user = await new Account(asSession(session.secret)).get();
			return { user: { id: user.$id, email: user.email, name: user.name }, sessionSecret: session.secret };
		} catch (e) {
			const code = (e as { code?: number }).code;
			if (code === 401 || code === 400) throw new AuthError("Invalid email or password", "invalid_credentials");
			throw e;
		}
	};

	return {
		async signUp(email, password, name) {
			try {
				await new Users(admin()).create({ userId: ID.unique(), email, password, name });
			} catch (e) {
				const err = e as { code?: number; type?: string };
				if (err.code === 409) throw new AuthError("Email already registered", "email_taken");
				if (err.code === 400) throw new AuthError("Password does not meet requirements", "weak_password");
				throw e;
			}
			return createSession(email, password);
		},
		signIn: createSession,
		async getUser(secret) {
			try {
				const user = await new Account(asSession(secret)).get();
				return { id: user.$id, email: user.email, name: user.name };
			} catch {
				return null;
			}
		},
		async signOut(secret) {
			try {
				await new Account(asSession(secret)).deleteSession({ sessionId: "current" });
			} catch {}
		},
		async deleteUser(userId) {
			try {
				await new Users(admin()).delete({ userId });
			} catch (e) {
				if ((e as { code?: number }).code !== 404) throw e;
			}
		},
	};
}
