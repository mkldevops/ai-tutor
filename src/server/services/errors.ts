export type AppErrorCode =
	| "unauthenticated"
	| "not_found"
	| "forbidden"
	| "invalid"
	| "conflict"
	| "rate_limited"
	| "off_programme"
	| "paused"
	| "parent_locked";

export class AppError extends Error {
	constructor(
		public code: AppErrorCode,
		message: string,
	) {
		super(message);
	}
}

export const notFound = (what: string) => new AppError("not_found", `${what} not found`);
