import { describe, expect, it, vi } from 'vitest';

import { deferCanAppend } from './defer-can-append.js';

/** A stand-in for the access-control database's event emitter. */
function emitter() {
	const handlers: Record<string, (() => void)[]> = {};
	return {
		on(event: string, handler: () => void) {
			(handlers[event] ??= []).push(handler);
		},
		emit(event: string) {
			for (const handler of handlers[event] ?? []) handler();
		}
	};
}

describe('deferCanAppend', () => {
	it('accepts without waiting when the rules are already there', async () => {
		const events = emitter();
		const canAppend = deferCanAppend({
			canAppend: async () => true,
			events,
			peerCount: () => 1,
			waitMs: 10_000
		});

		// No timer involved: if this waited, the test would take ten seconds.
		await expect(canAppend({})).resolves.toBe(true);
	});

	it('accepts an entry whose grant arrives during the wait', async () => {
		// The case the whole module exists for: correct data that got here before the
		// permission did.
		const events = emitter();
		let granted = false;

		const canAppend = deferCanAppend({
			canAppend: async () => granted,
			events,
			peerCount: () => 1,
			waitMs: 10_000
		});

		const verdict = canAppend({});
		granted = true;
		events.emit('update');

		await expect(verdict).resolves.toBe(true);
	});

	it('refuses immediately when there is nobody who could send the rules', async () => {
		const inner = vi.fn(async () => false);
		const canAppend = deferCanAppend({
			canAppend: inner,
			events: emitter(),
			peerCount: () => 0,
			waitMs: 10_000
		});

		await expect(canAppend({})).resolves.toBe(false);
		// Asked once, not twice: with no peers there is nothing to wait for.
		expect(inner).toHaveBeenCalledTimes(1);
	});

	it('stops waiting once the log has shown any sign of life', async () => {
		// After that, a refusal is a real refusal — otherwise every forged entry would
		// cost the counter another wait.
		//
		// Asserted with fake timers rather than by counting calls: the question is
		// whether it *waits*, and a call count was only ever a proxy for that. Under
		// fake timers a wait would never resolve, so resolving is the proof.
		vi.useFakeTimers();
		try {
			const events = emitter();
			const canAppend = deferCanAppend({
				canAppend: async () => false,
				events,
				peerCount: () => 1,
				waitMs: 10_000
			});

			events.emit('join');

			await expect(canAppend({})).resolves.toBe(false);
		} finally {
			vi.useRealTimers();
		}
	});

	it('gives up when the wait runs out, and asks once more before doing so', async () => {
		vi.useFakeTimers();
		try {
			const inner = vi.fn(async () => false);
			const canAppend = deferCanAppend({
				canAppend: inner,
				events: emitter(),
				peerCount: () => 1,
				waitMs: 5_000
			});

			const verdict = canAppend({});
			await vi.advanceTimersByTimeAsync(5_000);

			await expect(verdict).resolves.toBe(false);
			// Twice: the refusal is re-derived after the wait rather than assumed, so a
			// grant that lands in the last millisecond still counts.
			expect(inner).toHaveBeenCalledTimes(2);
		} finally {
			vi.useRealTimers();
		}
	});

	it('does not hold a second entry once the first has waited it out', async () => {
		// The wait is per controller, not per entry. Without this a device that never
		// receives the rules would pay the timeout again for every entry that arrives.
		vi.useFakeTimers();
		try {
			const events = emitter();
			const inner = vi.fn(async () => false);
			const canAppend = deferCanAppend({
				canAppend: inner,
				events,
				peerCount: () => 1,
				waitMs: 5_000
			});

			const first = canAppend({});
			events.emit('update');
			await expect(first).resolves.toBe(false);

			const second = canAppend({});
			// No timer advance: a wait here would never resolve and the test would hang.
			await expect(second).resolves.toBe(false);
		} finally {
			vi.useRealTimers();
		}
	});
});
