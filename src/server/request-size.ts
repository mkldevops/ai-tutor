export const MAX_SERVER_FN_BODY_BYTES = 6 * 1024 * 1024;
export const MAX_PAGE_BODY_BYTES = 64 * 1024;

const BODYLESS = new Set(["GET", "HEAD"]);

export function bodyLimit(handlerType: "serverFn" | "router"): number {
	return handlerType === "serverFn" ? MAX_SERVER_FN_BODY_BYTES : MAX_PAGE_BODY_BYTES;
}

export function checkRequestSize(request: Request, limit: number): Response | null {
	if (BODYLESS.has(request.method.toUpperCase())) return null;
	const header = request.headers.get("content-length");
	if (header === null) {
		if (request.body === null) return null;
		return new Response("Length Required", { status: 411 });
	}
	const length = Number(header);
	if (!/^\d+$/.test(header.trim()) || !Number.isSafeInteger(length)) {
		return new Response("Bad Request", { status: 400 });
	}
	if (length > limit) return new Response("Payload Too Large", { status: 413 });
	return null;
}
