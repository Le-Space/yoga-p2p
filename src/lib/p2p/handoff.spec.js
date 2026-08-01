// The scenario: Alice's connect tab holds the offer. She clicks the reply link in
// a messenger, which opens a *second* tab that has no offer at all. Without a
// handoff the second tab fails with "this reply belongs to a different connection
// attempt" and the first one waits forever for an answer that already arrived.

import { afterEach, describe, expect, it, vi } from 'vitest';

import { CLAIM_TIMEOUT_MS, createHandoff } from './handoff.js';

/**
 * A BroadcastChannel good enough to test with: every instance created under the
 * same name sees every other instance's messages, and never its own.
 */
function installFakeBroadcastChannel() {
	/** @type {Map<string, Set<any>>} */
	const rooms = new Map();

	class FakeBroadcastChannel extends EventTarget {
		/** @param {string} name */
		constructor(name) {
			super();
			this.name = name;
			if (!rooms.has(name)) rooms.set(name, new Set());
			rooms.get(name)?.add(this);
		}

		/** @param {any} data */
		postMessage(data) {
			for (const peer of rooms.get(this.name) ?? []) {
				if (peer === this) continue;
				peer.dispatchEvent(Object.assign(new Event('message'), { data }));
			}
		}

		close() {
			rooms.get(this.name)?.delete(this);
		}
	}

	vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
	if (typeof crypto === 'undefined' || !crypto.randomUUID) {
		let counter = 0;
		vi.stubGlobal('crypto', { randomUUID: () => `id-${++counter}` });
	}
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe('createHandoff', () => {
	it('gives the reply to the tab that owns the offer', async () => {
		installFakeBroadcastChannel();

		const owner = createHandoff();
		const newTab = createHandoff();
		/** @type {string[]} */
		const received = [];

		owner.onReply((payload) => {
			received.push(payload);
			return true;
		});

		await expect(newTab.offerReply('the-answer')).resolves.toBe(true);
		expect(received).toEqual(['the-answer']);

		owner.close();
		newTab.close();
	});

	it('reports no claim when the other tab cannot use the reply', async () => {
		installFakeBroadcastChannel();
		vi.useFakeTimers();

		const owner = createHandoff();
		const newTab = createHandoff();

		// A tab whose offer does not match this reply — it must stay silent
		// rather than acknowledge, or the sending tab would tell the user to close
		// it over a handshake nobody completed.
		owner.onReply(() => false);

		const claimed = newTab.offerReply('the-answer');
		await vi.advanceTimersByTimeAsync(CLAIM_TIMEOUT_MS);

		await expect(claimed).resolves.toBe(false);

		owner.close();
		newTab.close();
	});

	it('reports no claim when there is no other tab at all', async () => {
		installFakeBroadcastChannel();
		vi.useFakeTimers();

		const alone = createHandoff();

		const claimed = alone.offerReply('the-answer');
		await vi.advanceTimersByTimeAsync(CLAIM_TIMEOUT_MS);

		// The common case, and it must not hang: the reply is then handled right
		// here, exactly as it was before any of this existed.
		await expect(claimed).resolves.toBe(false);

		alone.close();
	});

	it('never hands a reply to the tab it came from', async () => {
		installFakeBroadcastChannel();
		vi.useFakeTimers();

		const tab = createHandoff();
		let calls = 0;
		tab.onReply(() => {
			calls++;
			return true;
		});

		const claimed = tab.offerReply('the-answer');
		await vi.advanceTimersByTimeAsync(CLAIM_TIMEOUT_MS);

		await expect(claimed).resolves.toBe(false);
		expect(calls).toBe(0);

		tab.close();
	});

	it('degrades to doing nothing where BroadcastChannel does not exist', async () => {
		vi.stubGlobal('BroadcastChannel', undefined);

		const handoff = createHandoff();
		handoff.onReply(() => true);

		// No branch at the call site: the caller simply learns nobody took it and
		// handles the reply itself.
		await expect(handoff.offerReply('the-answer')).resolves.toBe(false);
		expect(() => handoff.close()).not.toThrow();
	});
});
