// Folding a ledger for the screens that need one.
//
// Both sides of the counter fold the same way — that is the point of a pure
// reducer — but they read from different places: a student folds their own
// ledger, a studio device folds the one belonging to whichever student is
// standing in front of it. This is the one place that knows how to get from a
// list of events to a verified `LedgerState`.

import { get } from 'svelte/store';

import { reduceLedger } from '../ledger/index.js';
import { verifySignatures } from './ledger-signing.js';
import { deviceRegistry } from './registry.js';
import { studentTicketsStore } from './tickets.js';
import { readAll } from './open.js';

/**
 * Fold a list of ledger events into verified ticket state.
 *
 * @param {any[]} events
 * @param {string} [today] `YYYY-MM-DD`; defaults to the device's today
 * @returns {Promise<import('../ledger/index.js').LedgerState>}
 */
export async function foldLedger(events, today = new Date().toISOString().slice(0, 10)) {
	// Verification is asynchronous and the reducer is not, so every signature is
	// judged up front and the verdicts handed over as a lookup.
	const isSignatureValid = await verifySignatures(events);

	return reduceLedger(events, {
		devices: deviceRegistry(),
		isSignatureValid,
		today
	});
}

/**
 * Fold the ledger of one student, as this studio device currently holds it.
 *
 * @param {string} studentDid
 * @param {string} [today]
 * @returns {Promise<{ state: import('../ledger/index.js').LedgerState, db: any } | null>}
 */
export async function foldStudentLedger(studentDid, today) {
	const student = get(studentTicketsStore).get(studentDid);
	if (!student) return null;

	return { state: await foldLedger(student.events, today), db: student.db };
}

/**
 * Fold a ledger straight from its database.
 *
 * Needed immediately after writing: the stores are refreshed by OrbitDB's
 * `update` event, which has not necessarily fired yet, so folding from the store
 * would report the balance as it was *before* the write. That showed a
 * redemption as "balance left: 10" on a ten-class pass.
 *
 * @param {any} db
 * @param {string} [today]
 */
export async function foldFromDb(db, today) {
	return foldLedger(await readAll(db), today);
}
