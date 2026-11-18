import { describe, expect, it } from "vitest";
import { bodyLimit, checkRequestSize, MAX_PAGE_BODY_BYTES, MAX_SERVER_FN_BODY_BYTES } from "./request-size";

const req = (method: string, headers: Record<string, string> = {}, body?: string) =>
	new Request("http://localhost/_serverFn/x", { method, headers, body });

describe("request size", () => {
	it("allows larger bodies for server functions than for page requests", () => {
		expect(bodyLimit("serverFn")).toBe(MAX_SERVER_FN_BODY_BYTES);
		expect(bodyLimit("router")).toBe(MAX_PAGE_BODY_BYTES);
		expect(MAX_SERVER_FN_BODY_BYTES).toBeGreaterThan(4_194_304);
	});

	it("ignores methods without a body", () => {
		expect(checkRequestSize(req("GET"), 10)).toBeNull();
		expect(checkRequestSize(req("HEAD"), 10)).toBeNull();
	});

	it("accepts a declared length within the limit and an empty POST", () => {
		expect(checkRequestSize(req("POST", { "content-length": "10" }, "0123456789"), 10)).toBeNull();
		expect(checkRequestSize(req("POST"), 10)).toBeNull();
	});

	it("rejects oversized, malformed and undeclared bodies", () => {
		expect(checkRequestSize(req("POST", { "content-length": "11" }, "01234567890"), 10)?.status).toBe(413);
		expect(checkRequestSize(req("POST", { "content-length": "abc" }, "x"), 10)?.status).toBe(400);
		expect(checkRequestSize(req("POST", { "content-length": "-1" }, "x"), 10)?.status).toBe(400);
		expect(checkRequestSize(req("POST", {}, "streamed"), 10)?.status).toBe(411);
	});
});
