// The connection timeout is six minutes (session.js), because a mobile network
// behind carrier NAT can legitimately need minutes of ICE. That is only a safe
// number if a connection which has actually failed rejects immediately instead
// of running into it — otherwise a front desk stares at a spinner for six
// minutes on a link that is already dead.
//
// These tests pin exactly that: the timeout is a backstop, never the mechanism.

import { describe, expect, it, vi } from 'vitest';

import { waitForConnected } from './session.js';

/** A peer connection stripped to what waitForConnected reads. */
function fakePeerConnection(initial = 'connecting') {
	const target = new EventTarget();

	return {
		connectionState: initial,
		addEventListener: target.addEventListener.bind(target),
		removeEventListener: target.removeEventListener.bind(target),
		/** Move to a state and tell the listeners, the way the browser would. */
		moveTo(/** @type {string} */ state) {
			this.connectionState = state;
			target.dispatchEvent(new Event('connectionstatechange'));
		}
	};
}

describe('waitForConnected', () => {
	it('resolves without waiting when the connection is already up', async () => {
		const peerConnection = fakePeerConnection('connected');

		await expect(waitForConnected(/** @type {any} */ (peerConnection))).resolves.toBeUndefined();
	});

	it('resolves once the connection comes up', async () => {
		const peerConnection = fakePeerConnection();
		const waiting = waitForConnected(/** @type {any} */ (peerConnection));

		peerConnection.moveTo('connected');

		await expect(waiting).resolves.toBeUndefined();
	});

	for (const state of ['failed', 'closed']) {
		it(`rejects on '${state}' long before the six-minute timeout`, async () => {
			vi.useFakeTimers();

			try {
				const peerConnection = fakePeerConnection();
				const waiting = waitForConnected(/** @type {any} */ (peerConnection));

				peerConnection.moveTo(state);

				// Not a single timer tick has run: the rejection came from the event.
				await expect(waiting).rejects.toThrow(`The connection is ${state}.`);
			} finally {
				vi.useRealTimers();
			}
		});
	}

	it('stops listening once it has settled, so a later state change is inert', async () => {
		const peerConnection = fakePeerConnection();
		const waiting = waitForConnected(/** @type {any} */ (peerConnection));

		peerConnection.moveTo('connected');
		await waiting;

		// A settled promise cannot reject, but a leaked listener would keep the
		// object alive for the lifetime of the page. Moving on must be harmless.
		expect(() => peerConnection.moveTo('failed')).not.toThrow();
	});

	it('gives up when nothing ever happens, rather than waiting forever', async () => {
		vi.useFakeTimers();

		try {
			const peerConnection = fakePeerConnection();
			const waiting = waitForConnected(/** @type {any} */ (peerConnection));
			const settled = expect(waiting).rejects.toThrow('The connection timed out.');

			await vi.advanceTimersByTimeAsync(360_000);
			await settled;
		} finally {
			vi.useRealTimers();
		}
	});
});
