// Passing a reply to the tab that can actually use it.
//
// The problem is small and completely invisible until it happens. An offer is an
// RTCPeerConnection, and that lives in the memory of the tab that made it. But a
// reply link arrives through a messenger, and clicking a link in a messenger
// opens a *new* tab. That tab has no offer, so it cannot finish the handshake —
// and the tab that could is sitting right there, one window away, waiting for an
// answer that already arrived.
//
// So the new tab hands the reply over and says it can be closed, and the old tab
// completes. BroadcastChannel is the right size for this: same origin, same
// browser, no storage to clean up, and nothing to synchronise if no one listens.
//
// Deliberately not localStorage: a value that persists would replay an old
// handshake the next time a tab opens, and the failure would look like the
// connection screen misbehaving rather than like stale state.

const CHANNEL_NAME = 'yogasuci.handoff';

/** A reply looking for the tab that owns its offer. */
const REPLY = 'reply';

/** That tab, saying it took the reply. */
const CLAIMED = 'claimed';

/**
 * How long the handing-over tab waits to hear that somebody took it.
 *
 * Short on purpose: the listener is another tab of the same app on the same
 * machine, so if it is there at all it answers immediately. Waiting longer would
 * only delay telling the user that nothing picked it up.
 */
export const CLAIM_TIMEOUT_MS = 1500;

/**
 * Open the handoff channel.
 *
 * Returns a no-op implementation where BroadcastChannel does not exist, so
 * callers never have to branch — the flow then simply behaves as it did before,
 * with the reply handled in the tab that received it.
 *
 * @returns {{
 *   offerReply: (payload: string) => Promise<boolean>,
 *   onReply: (handler: (payload: string) => boolean | Promise<boolean>) => void,
 *   close: () => void
 * }}
 */
export function createHandoff() {
	if (typeof BroadcastChannel === 'undefined') {
		return {
			offerReply: async () => false,
			onReply: () => {},
			close: () => {}
		};
	}

	const channel = new BroadcastChannel(CHANNEL_NAME);
	/** @type {((payload: string) => boolean | Promise<boolean>) | null} */
	let handler = null;
	/** @type {Map<string, (claimed: boolean) => void>} */
	const pending = new Map();

	channel.addEventListener('message', async (event) => {
		const message = event.data;

		if (message?.kind === REPLY) {
			if (!handler) return;
			// Only answer when this tab actually took it. A tab that holds no
			// matching offer must stay silent, or the sending tab would report
			// success and close over a handshake nobody completed.
			const took = await handler(message.payload);
			if (took) channel.postMessage({ kind: CLAIMED, id: message.id });
			return;
		}

		if (message?.kind === CLAIMED) {
			pending.get(message.id)?.(true);
		}
	});

	return {
		/**
		 * Offer a reply to the other tabs.
		 *
		 * @param {string} payload
		 * @returns {Promise<boolean>} whether another tab took it
		 */
		offerReply(payload) {
			const id = crypto.randomUUID();

			return new Promise((resolve) => {
				const timer = setTimeout(() => {
					pending.delete(id);
					resolve(false);
				}, CLAIM_TIMEOUT_MS);

				pending.set(id, () => {
					clearTimeout(timer);
					pending.delete(id);
					resolve(true);
				});

				channel.postMessage({ kind: REPLY, id, payload });
			});
		},

		/**
		 * Handle replies offered by another tab. The handler returns whether this
		 * tab could actually use it.
		 *
		 * @param {(payload: string) => boolean | Promise<boolean>} next
		 */
		onReply(next) {
			handler = next;
		},

		close() {
			handler = null;
			channel.close();
		}
	};
}
