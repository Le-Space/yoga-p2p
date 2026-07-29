// Signing ledger events, and checking those signatures against the registry.
//
// The bridge between the pure reducer and OrbitDB, and it lives *here* rather
// than next to the reducer for exactly that reason: `src/lib/ledger/` must not
// import a database or a browser API (CLAUDE.md), and this file needs both.
// The reducer takes the verdict as a plain synchronous predicate instead.
//
// Why the ledger carries its own signature at all, when OrbitDB already signs
// every entry: `prevRedeemHash` covers the signature, so it has to exist before
// the entry does. The chain that makes a rolled-back ledger detectable
// (docs/PLAN.md §5) is built from the event, not from the log entry around it.

import { get } from 'svelte/store';

import { signingPayload } from '../ledger/canonical.js';
import { orbitdbStore } from '../p2p/node.js';
import { devicesStore } from './registry.js';

/**
 * Sign an event with this device's key.
 *
 * @param {Omit<import('../ledger/types.js').LedgerEvent, 'sig'>} event
 * @returns {Promise<string>}
 */
export async function signEvent(event) {
	const orbitdb = get(orbitdbStore);
	if (!orbitdb) throw new Error('The node is not running.');

	return orbitdb.identity.sign(orbitdb.identity, signingPayload(/** @type {any} */ (event)));
}

/**
 * A verdict function for the reducer, bound to the current registry.
 *
 * Verification needs the signing device's **public key**, which a DID alone
 * does not give us — the DID comes from the passkey, the signing key from
 * OrbitDB's keystore. So the registry records the public key when a device is
 * approved, and this reads it back.
 *
 * Asynchronous by nature and synchronous by requirement: the reducer must stay
 * pure, so every event is verified up front and the results handed over as a
 * lookup.
 *
 * @param {import('../ledger/types.js').LedgerEvent[]} events
 * @returns {Promise<import('../ledger/types.js').SignatureVerdict>}
 */
export async function verifySignatures(events) {
	const orbitdb = get(orbitdbStore);
	const keys = new Map(
		get(devicesStore)
			.filter((device) => device.publicKey)
			.map((device) => [device.deviceDid, device.publicKey])
	);

	/** @type {Set<string>} */
	const valid = new Set();

	for (const event of events) {
		const author =
			event.type === 'issue'
				? event.issuedBy
				: event.type === 'redeem'
					? event.redeemedBy
					: event.voidedBy;

		const publicKey = keys.get(author.deviceDid);
		if (!publicKey || !event.sig) continue;

		try {
			const ok = await orbitdb.identities.verify(event.sig, publicKey, signingPayload(event));
			if (ok) valid.add(eventKey(event));
		} catch {
			// A signature that cannot even be parsed is simply not valid.
		}
	}

	return (event) => valid.has(eventKey(event));
}

/**
 * Identity of an event for the verdict lookup.
 *
 * `_id` alone is not enough: a fork is two different events, and using the id
 * would let one branch's verdict stand in for the other's.
 *
 * @param {import('../ledger/types.js').LedgerEvent} event
 */
function eventKey(event) {
	return `${event._id}:${event.sig}`;
}
