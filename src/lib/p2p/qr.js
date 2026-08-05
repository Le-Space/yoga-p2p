// What is left of this application's own QR handling.
//
// Rendering and reading both moved into the package: <qr-invite> draws the code
// and splits it into an animated sequence when one would be too dense to read,
// and <qr-scanner> owns the camera and the decode loop. What stays here is the
// share sheet, which is about this application rather than about codes, and one
// threshold that is now a warning rather than a wall.

/**
 * Above this, a QR code needs so many modules that phone cameras stop
 * resolving it reliably at arm's length. Byte mode tops out at 2953 characters
 * (version 40, error correction L); this leaves headroom.
 */
export const QR_CHARACTER_BUDGET = 2200;

/** @param {string} text */
/**
 * What still fits a single static code.
 *
 * Kept as a guard against runaway payload growth rather than as a hard limit:
 * `<qr-invite>` splits anything longer into an animated sequence, so a link over
 * this is slower to scan but no longer refused. Rendering and decoding both live
 * in the package now - this file keeps only what is this application's own.
 */
/**
 * @param {object} options
 * @param {string} options.title
 * @param {string} options.text
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
