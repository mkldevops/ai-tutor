import { createHash } from "node:crypto";

export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
export const MAX_IMAGE_BASE64 = Math.ceil(MAX_IMAGE_BYTES / 3) * 4;

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

export function validateImage(base64: string, declaredMime: string): ValidImage {
	if (base64.length > MAX_IMAGE_BASE64) throw new ImageRejected("The photo is too large (max 3 MB).");
	if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new ImageRejected("The photo could not be read.");
	const bytes = new Uint8Array(Buffer.from(base64, "base64"));
	if (bytes.length === 0) throw new ImageRejected("The photo is empty.");
	if (bytes.length > MAX_IMAGE_BYTES) throw new ImageRejected("The photo is too large (max 3 MB).");
	const mimeType = sniffMime(bytes);
	if (!mimeType || mimeType !== declaredMime) throw new ImageRejected("Only JPEG, PNG or WebP photos are accepted.");
	return { bytes, mimeType, sha256: createHash("sha256").update(bytes).digest("hex") };
}
