// What this file used to test no longer runs.
//
// `session.js` once carried its own `waitForConnected`, and this spec pinned the
// invariant that made a six-minute timeout defensible: a connection that has
// actually failed rejects on the event and never reaches the timeout. Adopting
// `QRSession` moved that waiting into the package — but the function stayed
// behind, uncalled, with these tests still green. A test of a copy nobody runs is
// worse than no test: it reports on code that cannot break anything, while the
// code that can is unwatched.
//
// The invariant itself is upstream's now, and upstream tests it. What is still
// ours, and what regresses silently, is the *numbers we hand it*. The package
// defaults to a 30 s `connectionTimeout`; passing our own is the whole of #27,
// and deleting those two lines would look like tidying up.

import { describe, expect, it, vi } from 'vitest';

/** Captures what `createSignalling` constructs QRSession with. */
const constructed = vi.hoisted(() => /** @type {any[]} */ ([]));

vi.mock('@le-space/libp2p-webrtc-qr', () => ({
	QRSession: class {
		/**
		 * @param {unknown} node
		 * @param {Record<string, unknown>} options
		 */
		constructor(node, options) {
			constructed.push({ node, options });
		}
		offers = new Map();
		inbound = new Set();
	},
	parsePayload: vi.fn(),
	QR_TYPE_OFFER: 'offer'
}));

const { createSignalling } = await import('./session.js');

/** @returns {Record<string, any>} */
function optionsFor(node = { peerId: { toString: () => 'peer' } }) {
	constructed.length = 0;
	createSignalling(node);
	return constructed[0].options;
}

describe('the timeouts createSignalling hands to the package', () => {
	it('waits six minutes for a connection, not the package default of thirty seconds', () => {
		// #27: a mobile network behind carrier NAT can need minutes of ICE, and the
		// old 30 s cut those off mid-setup. Safe only because a real failure rejects
		// on the connection-state event long before this — so the six minutes only
		// ever apply to a peer that is slow rather than gone.
		expect(optionsFor().connectionTimeout).toBe(360_000);
	});

	it('gives the answering side the same patience', () => {
		// A code that travels by message is answered at human speed. A short wait
		// here closes the connection before the reply can land.
		expect(optionsFor().answerWaitTimeout).toBe(360_000);
	});

	it('keeps the dial a retry loop rather than one long attempt', () => {
		// Fifteen short tries, not one patient one: the answering peer may still be
		// attaching its muxer, and a single attempt with a long signal would spend
		// the whole budget waiting for the first one to give up.
		const options = optionsFor();

		expect(options.dialAttempts).toBeGreaterThan(1);
		expect(options.dialRetryDelay).toBeLessThan(options.connectionTimeout);
	});

	it('caps ICE gathering, so a stalled gather cannot hang the screen', () => {
		expect(optionsFor().iceGatheringTimeout).toBe(15_000);
	});

	it('passes an rtcConfiguration, which is what carries the ICE mode', () => {
		// `?ice=host` works by this being a function that is asked each time —
		// freezing it to a value would silently pin whichever mode was current when
		// the session was built.
		expect(optionsFor().rtcConfiguration).toBeTypeOf('function');
	});
});
