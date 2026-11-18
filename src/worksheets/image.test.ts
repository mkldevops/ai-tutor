import { describe, expect, it } from "vitest";
import { ImageRejected, imageDimensions, MAX_IMAGE_BYTES, MAX_IMAGE_SIDE, sniffMime, validateImage } from "./image";

const u16be = (n: number) => [(n >> 8) & 0xff, n & 0xff];
const u32be = (n: number) => [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
const u24le = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff];
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

const jpeg = (width: number, height: number) =>
	Uint8Array.from([
		0xff,
		0xd8,
		0xff,
		0xe0,
		0,
		6,
		...ascii("JFIF"),
		0xff,
		0xff,
		0xc2,
		0,
		0x11,
		8,
		...u16be(height),
		...u16be(width),
		3,
		0,
		0,
		0,
		0,
		0,
		0,
	]);
const png = (width: number, height: number) =>
	Uint8Array.from([
		0x89,
		0x50,
		0x4e,
		0x47,
		0x0d,
		0x0a,
		0x1a,
		0x0a,
		0,
		0,
		0,
		0x0d,
		...ascii("IHDR"),
		...u32be(width),
		...u32be(height),
		8,
		2,
	]);
const webp = (chunk: string, body: number[]) =>
	Uint8Array.from([
		...ascii("RIFF"),
		0,
		0,
		0,
		0,
		...ascii("WEBP"),
		...ascii(chunk),
		0,
		0,
		0,
		0,
		...body,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
	]);
const webpVp8x = (width: number, height: number) =>
	webp("VP8X", [0, 0, 0, 0, ...u24le(width - 1), ...u24le(height - 1)]);
const webpVp8 = (width: number, height: number) =>
	webp("VP8 ", [0, 0, 0, 0x9d, 0x01, 0x2a, width & 0xff, width >> 8, height & 0xff, height >> 8]);
const webpVp8l = (width: number, height: number) => {
	const w = width - 1;
	const h = height - 1;
	return webp("VP8L", [0x2f, w & 0xff, ((w >> 8) & 0x3f) | ((h & 0x03) << 6), (h >> 2) & 0xff, (h >> 10) & 0x0f]);
};

const b64 = (b: Uint8Array) => Buffer.from(b).toString("base64");

describe("image validation", () => {
	it("sniffs JPEG, PNG and WebP by magic bytes", () => {
		expect(sniffMime(jpeg(10, 10))).toBe("image/jpeg");
		expect(sniffMime(png(10, 10))).toBe("image/png");
		expect(sniffMime(webpVp8x(10, 10))).toBe("image/webp");
		expect(sniffMime(new TextEncoder().encode("GIF89a"))).toBeNull();
		expect(sniffMime(new TextEncoder().encode("%PDF-1.7"))).toBeNull();
	});

	it("reads the pixel size from each format header", () => {
		expect(imageDimensions(jpeg(4032, 3024), "image/jpeg")).toEqual({ width: 4032, height: 3024 });
		expect(imageDimensions(png(1200, 1600), "image/png")).toEqual({ width: 1200, height: 1600 });
		expect(imageDimensions(webpVp8x(3000, 4000), "image/webp")).toEqual({ width: 3000, height: 4000 });
		expect(imageDimensions(webpVp8(640, 480), "image/webp")).toEqual({ width: 640, height: 480 });
		expect(imageDimensions(webpVp8l(800, 600), "image/webp")).toEqual({ width: 800, height: 600 });
	});

	it("accepts a valid image and hashes it", () => {
		const bytes = jpeg(1200, 1600);
		const img = validateImage(b64(bytes), "image/jpeg");
		expect(img.mimeType).toBe("image/jpeg");
		expect(img.bytes.length).toBe(bytes.length);
		expect(img.sha256).toMatch(/^[0-9a-f]{64}$/);
	});

	it("rejects a declared type that does not match the content", () => {
		expect(() => validateImage(b64(png(10, 10)), "image/jpeg")).toThrow(ImageRejected);
	});

	it("rejects non-images, bad base64 and oversized payloads", () => {
		expect(() => validateImage(b64(new TextEncoder().encode("<svg onload=x>")), "image/jpeg")).toThrow(ImageRejected);
		expect(() => validateImage("not base64!", "image/jpeg")).toThrow(ImageRejected);
		const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
		big.set(jpeg(10, 10));
		expect(() => validateImage(b64(big), "image/jpeg")).toThrow(/too large/);
	});

	it("rejects headers without a readable size and images with too many pixels", () => {
		expect(() => validateImage(b64(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4])), "image/jpeg")).toThrow(
			/could not be read/,
		);
		expect(() => validateImage(b64(png(0, 10)), "image/png")).toThrow(/could not be read/);
		expect(() => validateImage(b64(png(MAX_IMAGE_SIDE + 1, 10)), "image/png")).toThrow(/too large/);
		expect(() => validateImage(b64(webpVp8x(9000, 9000)), "image/webp")).toThrow(/too large/);
	});
});
