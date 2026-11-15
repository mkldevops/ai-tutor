import { describe, expect, it } from "vitest";
import { ImageRejected, MAX_IMAGE_BYTES, sniffMime, validateImage } from "./image";

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
const WEBP = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");
const b64 = (b: Uint8Array) => Buffer.from(b).toString("base64");

describe("image validation", () => {
	it("sniffs JPEG, PNG and WebP by magic bytes", () => {
		expect(sniffMime(JPEG)).toBe("image/jpeg");
		expect(sniffMime(PNG)).toBe("image/png");
		expect(sniffMime(WEBP)).toBe("image/webp");
		expect(sniffMime(new TextEncoder().encode("GIF89a"))).toBeNull();
		expect(sniffMime(new TextEncoder().encode("%PDF-1.7"))).toBeNull();
	});

	it("accepts a valid image and hashes it", () => {
		const img = validateImage(b64(JPEG), "image/jpeg");
		expect(img.mimeType).toBe("image/jpeg");
		expect(img.bytes.length).toBe(JPEG.length);
		expect(img.sha256).toMatch(/^[0-9a-f]{64}$/);
	});

	it("rejects a declared type that does not match the content", () => {
		expect(() => validateImage(b64(PNG), "image/jpeg")).toThrow(ImageRejected);
	});

	it("rejects non-images, bad base64 and oversized payloads", () => {
		expect(() => validateImage(b64(new TextEncoder().encode("<svg onload=x>")), "image/jpeg")).toThrow(ImageRejected);
		expect(() => validateImage("not base64!", "image/jpeg")).toThrow(ImageRejected);
		const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
		big.set(JPEG);
		expect(() => validateImage(b64(big), "image/jpeg")).toThrow(/too large/);
	});
});
