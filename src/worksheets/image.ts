import { createHash } from "node:crypto";

export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
export const MAX_IMAGE_BASE64 = Math.ceil(MAX_IMAGE_BYTES / 3) * 4;

export const MAX_IMAGE_SIDE = 10_000;
export const MAX_IMAGE_PIXELS = 50_000_000;

export type ImageMime = "image/jpeg" | "image/png" | "image/webp";
export type ValidImage = { bytes: Uint8Array; mimeType: ImageMime; sha256: string };

export class ImageRejected extends Error {}

export function sniffMime(b: Uint8Array): ImageMime | null {
	if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
	if ([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v)) return "image/png";
	const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
	if (b.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
	return null;
}

const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u32be = (b: Uint8Array, i: number) => ((b[i] << 24) >>> 0) + ((b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]);
const u24le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);

function jpegDimensions(b: Uint8Array): Dimensions | null {
	let i = 2;
	while (i + 9 < b.length) {
		if (b[i] !== 0xff) return null;
		const marker = b[i + 1];
		if (marker === 0xff) {
			i += 1;
			continue;
		}
		if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
			i += 2;
			continue;
		}
		if (marker === 0xd9 || marker === 0xda) return null;
		const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
		if (isFrame) return { height: u16be(b, i + 5), width: u16be(b, i + 7) };
		const length = u16be(b, i + 2);
		if (length < 2) return null;
		i += 2 + length;
	}
	return null;
}

function webpDimensions(b: Uint8Array): Dimensions | null {
	if (b.length < 30) return null;
	const chunk = String.fromCharCode(...b.subarray(12, 16));
	if (chunk === "VP8 ") return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
	if (chunk === "VP8L") {
		if (b[20] !== 0x2f) return null;
		return {
			width: 1 + (((b[22] & 0x3f) << 8) | b[21]),
			height: 1 + (((b[24] & 0x0f) << 10) | (b[23] << 2) | ((b[22] & 0xc0) >> 6)),
		};
	}
	if (chunk === "VP8X") return { width: 1 + u24le(b, 24), height: 1 + u24le(b, 27) };
	return null;
}

const u16le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);

export type Dimensions = { width: number; height: number };

export function imageDimensions(b: Uint8Array, mime: ImageMime): Dimensions | null {
	if (mime === "image/png") {
		if (b.length < 24 || String.fromCharCode(...b.subarray(12, 16)) !== "IHDR") return null;
		return { width: u32be(b, 16), height: u32be(b, 20) };
	}
	if (mime === "image/jpeg") return jpegDimensions(b);
	return webpDimensions(b);
}

export function validateImage(base64: string, declaredMime: string): ValidImage {
	if (base64.length > MAX_IMAGE_BASE64) throw new ImageRejected("The photo is too large (max 3 MB).");
	if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new ImageRejected("The photo could not be read.");
	const bytes = new Uint8Array(Buffer.from(base64, "base64"));
	if (bytes.length === 0) throw new ImageRejected("The photo is empty.");
	if (bytes.length > MAX_IMAGE_BYTES) throw new ImageRejected("The photo is too large (max 3 MB).");
	const mimeType = sniffMime(bytes);
	if (!mimeType || mimeType !== declaredMime) throw new ImageRejected("Only JPEG, PNG or WebP photos are accepted.");
	const size = imageDimensions(bytes, mimeType);
	if (!size || size.width < 1 || size.height < 1) throw new ImageRejected("The photo could not be read.");
	if (size.width > MAX_IMAGE_SIDE || size.height > MAX_IMAGE_SIDE || size.width * size.height > MAX_IMAGE_PIXELS) {
		throw new ImageRejected("The photo is too large (max 10,000 pixels per side).");
	}
	return { bytes, mimeType, sha256: createHash("sha256").update(bytes).digest("hex") };
}
