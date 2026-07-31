// Waiting for a grant instead of refusing an entry that is merely early.
//
// The failure this fixes is the one measured in docs/LIMITS.md §1.8. An
// `OrbitDBAccessController` is itself an OrbitDB database, so a device opening a
// log for the first time has to replicate the *write set* before it can validate
// anything written to that log. Both travel over the same connection at once, and
// when the entries win the race, `canAppend` judges them against a write set that
// is not there yet, returns false, and OrbitDB drops the entry **permanently**.
// The grant arrives a second later; nothing ever re-offers the entry.
//
// `pullHistory` in ./open.js rescues that from the outside by asking again. This
// treats it at the point of failure instead: on a refusal, wait briefly for the
// access-control log to show any sign of life, then ask the same question again.
// The idea and its guards come from `Le-Space/orbitdb-relay-pinner`
// (src/access/deferred-orbitdb-access-controller.ts).
//
// **Why not simply always wait.** `canAppend` runs for every entry, including ones
// that genuinely have no business being there — a student writing into their own
// ledger, which the reducer would refuse anyway. Waiting five seconds each would
// turn a handful of junk entries into a frozen counter. Hence three guards, and
// each one earns its place:
//
//   - alone on the network, nothing can arrive, so there is nothing to wait for;
//   - once the log has shown activity, the write set is present and a refusal is a
//     real refusal, so no further entry ever waits;
//   - the wait is bounded, because a peer that stays silent must not hold the
//     check-in screen.

/** How long to give the access-control log before treating a refusal as final. */
export const DEFAULT_ACL_WAIT_MS = 5_000;

/**
 * Wrap a `canAppend` so a refusal waits once for the access rules to arrive.
 *
 * Takes the pieces rather than a controller, so the decision can be tested without
 * opening a database — which is the whole reason this is its own module.
 *
 * @param {object} options
 * @param {(entry: any) => Promise<boolean>} options.canAppend the controller's own check
 * @param {{ on: (event: string, handler: () => void) => void }} options.events the
 *   access-control database's events; `update` or `join` means it is alive
 * @param {() => number} options.peerCount how many peers could still send the rules
 * @param {number} [options.waitMs]
 * @returns {(entry: any) => Promise<boolean>}
 */
export function deferCanAppend({ canAppend, events, peerCount, waitMs = DEFAULT_ACL_WAIT_MS }) {
	let seen = false;
	/** @type {(() => void) | null} */
	let wake = null;

	const alive = () => {
		seen = true;
		wake?.();
		wake = null;
	};

	events.on('update', alive);
	events.on('join', alive);

	return async function canAppendOrWait(entry) {
		if (await canAppend(entry)) return true;

		// Nothing can arrive: a refusal now is the answer, not a race.
		if (peerCount() === 0) return false;

		// The log has already spoken, so there is nothing to wait for — but *ask
		// again* rather than refuse. A test caught this: the very event being waited
		// for can land between the check above and the wait below, and treating
		// `seen` as "refuse" threw away the answer at the exact moment it arrived.
		// Re-asking costs nothing and cannot be wrong.
		if (seen) return canAppend(entry);

		await new Promise((resolve) => {
			const timer = setTimeout(() => {
				wake = null;
				resolve(undefined);
			}, waitMs);

			wake = () => {
				clearTimeout(timer);
				resolve(undefined);
			};
		});

		// Asked again, not assumed: the wait may have ended on the timeout with the
		// rules still missing, and an entry accepted on a hope is worse than one
		// refused on a fact.
		return canAppend(entry);
	};
}
