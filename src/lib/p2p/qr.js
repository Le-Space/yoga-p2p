// Rendering and reading the QR codes that carry the signed SDP payloads.
//
// The payload is the whole handshake, so size is the constraint that shapes
// this file: a signed, deflate-compressed offer sits near the practical limit
// of a single QR code. When it does not fit, the assistant falls back to
// copy & paste rather than silently producing a code no camera can read.

import QRCode from 'qrcode';
import jsQR from 'jsqr';

/**
 * Above this, a QR code needs so many modules that phone cameras stop
 * resolving it reliably at arm's length. Byte mode tops out at 2953 characters
 * (version 40, error correction L); this leaves headroom.
 */
export const QR_CHARACTER_BUDGET = 2200;

/** @param {string} text */
export function fitsInQrCode(text) {
	return text.length <= QR_CHARACTER_BUDGET;
}

/**
 * Render a payload as a data URL.
 *
 * Error correction stays at 'L': these codes are read from a bright screen at
 * close range, where the extra redundancy of higher levels buys nothing and
 * costs modules the payload needs.
 *
 * @param {string} text
 * @returns {Promise<string>} a `data:image/png;base64,…` URL
 */
export function renderQrCode(text) {
	if (!fitsInQrCode(text)) {
		throw new Error(
			`This code is ${text.length} characters and does not fit in a scannable QR code. Use copy & paste.`
		);
	}

	return QRCode.toDataURL(text, {
		errorCorrectionLevel: 'L',
		margin: 2,
		scale: 6,
		color: { dark: '#000000', light: '#ffffff' }
	});
}

/**
 * Read a QR code out of a single video frame.
 *
 * @param {HTMLVideoElement} video
 * @param {HTMLCanvasElement} canvas scratch surface, reused across frames
 * @returns {string | null} the decoded text, or null when no code is in frame
 */
export function decodeFrame(video, canvas) {
	const width = video.videoWidth;
	const height = video.videoHeight;
	if (!width || !height) return null;

	canvas.width = width;
	canvas.height = height;

	const context = canvas.getContext('2d', { willReadFrequently: true });
	if (!context) return null;

	context.drawImage(video, 0, 0, width, height);
	const image = context.getImageData(0, 0, width, height);
	// The codes are shown on screens, so both polarities occur: a dark-mode page
	// can invert the field despite .qr-field, and printed posters do not.
	const result = jsQR(image.data, width, height, { inversionAttempts: 'attemptBoth' });

	return result?.data ?? null;
}

/**
 * Scan with the camera until a code is read or the caller aborts.
 *
 * Prefers the rear camera, which is what a front-desk device points at a
 * student's screen. Always stops the media tracks — a camera left running is
 * both a battery and a trust problem.
 *
 * @param {object} options
 * @param {HTMLVideoElement} options.video
 * @param {HTMLCanvasElement} options.canvas
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<string>} the decoded payload
 */
export async function scanWithCamera({ video, canvas, signal }) {
	const stream = await navigator.mediaDevices.getUserMedia({
		video: { facingMode: { ideal: 'environment' } },
		audio: false
	});

	video.srcObject = stream;
	video.setAttribute('playsinline', 'true');
	await video.play();

	try {
		return await new Promise((resolve, reject) => {
			/** @type {number} */
			let frame;

			const stop = () => cancelAnimationFrame(frame);

			signal?.addEventListener('abort', () => {
				stop();
				reject(new DOMException('Scan cancelled', 'AbortError'));
			});

			const tick = () => {
				if (signal?.aborted) return;
				try {
					const text = decodeFrame(video, canvas);
					if (text) {
						stop();
						resolve(text);
						return;
					}
				} catch (error) {
					stop();
					reject(error);
					return;
				}
				frame = requestAnimationFrame(tick);
			};

			frame = requestAnimationFrame(tick);
		});
	} finally {
		for (const track of stream.getTracks()) track.stop();
		video.srcObject = null;
	}
}

/**
 * Hand a payload to whatever the device can share with — Signal, WhatsApp,
 * mail — and fall back to the clipboard where the Web Share API is missing
 * (every desktop browser, and the Playwright suite).
 *
 * @param {object} payload
 * @param {string} payload.title
 * @param {string} payload.text
 * @returns {Promise<'shared' | 'copied'>}
 */
export async function sharePayload({ title, text }) {
	if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
		try {
			await navigator.share({ title, text });
			return 'shared';
		} catch (/** @type {any} */ error) {
			// A cancelled share sheet is a decision, not a failure — do not then
			// push the payload into the clipboard behind the user's back.
			if (error?.name === 'AbortError') throw error;
		}
	}

	await navigator.clipboard.writeText(text);
	return 'copied';
}
