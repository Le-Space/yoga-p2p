// Turn a payload into a video file Chromium can play as a fake camera.
//
// This is what makes the *real* scan path testable: the app's decoder runs
// against an actual MediaStream instead of a stubbed one, so the thing under
// test is the same code a phone runs at the front desk.
//
// Written in plain Node from the QR module matrix rather than by shelling out
// to ffmpeg. ffmpeg happens to be installed here and on GitHub's runners, but
// an unstated system binary is exactly the kind of dependency that fails on
// someone else's machine — and `qrcode` already hands us the modules.

import { writeFileSync } from 'node:fs';
import QRCode from 'qrcode';

/** Modules of white space the QR spec requires around a code. */
const QUIET_ZONE = 4;

/**
 * Write a Y4M file showing `text` as a QR code.
 *
 * @param {object} options
 * @param {string} options.text the payload to encode
 * @param {string} options.path where to write the .y4m
 * @param {number} [options.size] frame edge length in pixels, square
 * @param {number} [options.frames] how many identical frames to emit
 * @returns {{ path: string, modules: number, scale: number }}
 */
export function writeQrVideo({ text, path, size = 720, frames = 20 }) {
	// Error correction 'L' matches what the app renders, so the module count
	// here is the module count a real scanner would face.
	const qr = QRCode.create(text, { errorCorrectionLevel: 'L' });
	const modules = qr.modules.size;
	const dark = qr.modules.data;

	const scale = Math.floor(size / (modules + QUIET_ZONE * 2));
	if (scale < 2) {
		throw new Error(
			`A ${modules}-module code does not fit in ${size}px at a scannable scale. ` +
				'Raise `size`, or the payload is too large for the camera path at all.'
		);
	}

	const codePixels = modules * scale;
	const offset = Math.floor((size - codePixels) / 2);

	// Luma plane: white ground, dark modules. Chroma stays neutral — a QR code
	// has no colour, and a grey frame is what a camera would deliver anyway.
	const luma = new Uint8Array(size * size).fill(255);

	for (let row = 0; row < modules; row++) {
		for (let column = 0; column < modules; column++) {
			if (!dark[row * modules + column]) continue;

			const top = offset + row * scale;
			const left = offset + column * scale;

			for (let y = top; y < top + scale; y++) {
				luma.fill(0, y * size + left, y * size + left + scale);
			}
		}
	}

	const chromaPlane = new Uint8Array((size / 2) * (size / 2)).fill(128);

	const header = Buffer.from(`YUV4MPEG2 W${size} H${size} F25:1 Ip A1:1 C420mpeg2\n`, 'ascii');
	const frameMarker = Buffer.from('FRAME\n', 'ascii');
	const frame = Buffer.concat([frameMarker, luma, chromaPlane, chromaPlane]);

	writeFileSync(path, Buffer.concat([header, ...Array.from({ length: frames }, () => frame)]));

	return { path, modules, scale };
}
