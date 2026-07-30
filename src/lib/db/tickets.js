// The ticket ledger — one append-only log per student (docs/PLAN.md §3.4).
//
// Same shape as bookings, and for the same reason: the student carries it
// between locations, which is what makes them the sync courier that keeps
// double-spending honest without a relay (§5).
//
// The studio owns the books, not the student (docs/PLAN.md §3.4). Whoever took
// the money decides whether a ticket exists — that part was always true, because
// the `issue` event carries the selling device's signature and the reducer refuses
// events from devices outside the registry. What changed is who holds the
// database: the student used to be admin of their own ledger, which put the power
// to revoke the studio's write access in the hands of the one person with an
// interest in no further redemptions being written.
//
// Every ledger is now opened with the shared studio access controller, so its
// address follows from the student's DID alone and nobody has to be told it. See
// ./studio-acl.js for why that works and what it buys.
//
// Security still lives in the fold, not in the ACL: even a writer who got past
// the access controller produces nothing usable unless the registry knows their
// device.

import { get, writable } from 'svelte/store';

import { openDocuments, readAll } from './open.js';
import { studioAccessController } from './studio-acl.js';
import { signEvent } from './ledger-signing.js';
import { canRedeem, nextChainPosition } from '../ledger/index.js';
import { nodeStatusStore, ownDidStore } from '../p2p/node.js';

export const ticketsDbStore = writable(/** @type {any} */ (null));
export const ticketEventsStore = writable(/** @type {any[]} */ ([]));

/**
 * Ticket ledgers replicated from students, keyed by DID. Studio devices only.
 *
 * @type {import('svelte/store').Writable<Map<string, { did: string, db: any, events: any[] }>>}
 */
export const studentTicketsStore = writable(new Map());

nodeStatusStore.subscribe(({ state }) => {
	if (state !== 'idle') return;
	ticketsDbStore.set(null);
	ticketEventsStore.set([]);
	studentTicketsStore.set(new Map());
});

/** The one name a student's ledger ever has, on every device. */
export function ticketLedgerName(/** @type {string} */ studentDid) {
	return `yoga-tickets-${studentDid}`;
}

/**
 * Open this device's own ledger, as a reader.
 *
 * The studio owner is the only writer in the manifest, so this device replicates
 * its passes and can show them, but cannot write to them — which is the point.
 * Needs the owner's DID, which a student learns when joining the studio; before
 * that there is no ledger to open, because there is no studio it would belong to.
 *
 * @param {object} options
 * @param {string} options.ownerDid
 */
export async function openOwnTickets({ ownerDid }) {
	const own = get(ownDidStore);
	if (!own) throw new Error('This device has no identity yet.');
	if (!ownerDid) throw new Error('This device does not belong to a studio yet.');

	const db = await openDocuments({
		key: 'tickets',
		name: ticketLedgerName(own),
		accessController: studioAccessController(ownerDid)
	});

	ticketsDbStore.set(db);
	db.events.on('update', () => refreshTickets());
	await refreshTickets();

	return db;
}

export async function refreshTickets() {
	const db = get(ticketsDbStore);
	if (!db) return;
	ticketEventsStore.set(await readAll(db));
}

/**
 * Sell a ticket for cash.
 *
 * The event *is* the ticket — there is no separate record to keep in step, and
 * no balance field that could disagree with the log (CLAUDE.md).
 *
 * @param {object} sale
 * @param {any} sale.db the student's ledger
 * @param {string} sale.studentDid
 * @param {any} sale.package the package document being sold
 * @param {{ deviceDid: string, locationId: string }} sale.issuedBy
 * @param {string} sale.today
 * @returns {Promise<string>} the ticket id
 */
export async function issueTicket({ db, studentDid, package: pkg, issuedBy, today }) {
	const ticketId = `ticket:${crypto.randomUUID()}`;

	// The window is written onto the ticket at sale time, and the reducer only
	// ever judges against the ticket (docs/PLAN.md §3.2). A package edited later
	// must not silently change what somebody already bought.
	const validityDays = Number(pkg.validityDays) || 0;
	const validUntil =
		pkg.validityStart === 'firstRedeem' ? null : addDays(today, Math.max(0, validityDays - 1));

	/** @type {any} */
	const event = {
		_id: ticketId,
		type: 'issue',
		studentDid,
		packageId: pkg._id,
		courseId: null,
		unitsTotal: pkg.units === null || pkg.units === undefined ? null : Number(pkg.units),
		payment: {
			method: 'cash',
			amountEUR: Number(pkg.priceEUR),
			receivedAt: new Date().toISOString()
		},
		issuedBy,
		validFrom: today,
		validUntil,
		validityStart: pkg.validityStart ?? 'issue',
		validityDays: validityDays || null
	};

	event.sig = await signEvent(event);
	await putWhenPermitted(db, event);

	return ticketId;
}

const GRANT_WAIT_MS = 15_000;
const GRANT_RETRY_MS = 500;

/**
 * Write, retrying while a write grant is still in flight.
 *
 * The owner never needs this: their DID is in the ledger's immutable manifest, so
 * their writes are valid the moment the database exists. A front-desk device does,
 * once — its grant lives in the shared studio controller and has to replicate into
 * its own copy before it may append. Approving a device and selling from it
 * seconds later is therefore early, not forbidden.
 *
 * Retrying is the honest response — the action is legitimate and will be
 * permitted shortly. Failing outright would tell the person at the counter that
 * their sale was rejected when it was merely early.
 *
 * @param {any} db
 * @param {any} event
 */
async function putWhenPermitted(db, event) {
	const deadline = Date.now() + GRANT_WAIT_MS;
	/** @type {any} */
	let lastError;

	while (Date.now() < deadline) {
		try {
			return await db.put(event);
		} catch (/** @type {any} */ error) {
			if (!String(error?.message ?? '').includes('not allowed to write')) throw error;
			lastError = error;
			await new Promise((resolve) => setTimeout(resolve, GRANT_RETRY_MS));
		}
	}

	throw lastError ?? new Error('Could not write to the ledger.');
}

/**
 * Redeem a visit against a ticket (docs/PLAN.md §4.3).
 *
 * The order is the double-spend mechanism, not a style choice. The caller has
 * already pulled the student's heads over the live connection and folded them;
 * this writes the *next* chain position from that fold. A device working from a
 * stale view therefore reuses a position somebody else already took, and the
 * result is a detectable fork rather than a silent overwrite (§5, layer 2).
 *
 * The pre-flight is the same rule the fold applies afterwards, so the counter
 * never writes a redemption that its own ledger would then reject.
 *
 * @param {object} redemption
 * @param {any} redemption.db the student's ledger
 * @param {import('../ledger/index.js').TicketState} redemption.state the fold
 * @param {string} redemption.courseId
 * @param {string} redemption.date
 * @param {{ deviceDid: string, locationId: string }} redemption.redeemedBy
 * @returns {Promise<string>} the redemption id
 */
export async function redeemTicket({ db, state, courseId, date, redeemedBy }) {
	const verdict = canRedeem(state, { courseId, date });
	if (!verdict.ok) throw new Error(`redeem-refused:${verdict.reason}`);

	const { seq, prevRedeemHash } = nextChainPosition(state);

	/** @type {any} */
	const event = {
		_id: `redeem:${crypto.randomUUID()}`,
		type: 'redeem',
		ticketId: state.ticketId,
		seq,
		prevRedeemHash,
		courseId,
		date,
		redeemedBy,
		redeemedAt: new Date().toISOString()
	};

	event.sig = await signEvent(event);
	await putWhenPermitted(db, event);

	return event._id;
}

/**
 * Open a student's ledger on a studio device.
 *
 * No address argument any more, and that is the whole gain: name plus the shared
 * controller give the same address on every device, so a front-desk device at the
 * second location opens the ledger of a student it has never met without anyone
 * having exchanged an address for them.
 *
 * @param {string} studentDid
 * @param {string} ownerDid
 */
export async function openStudentTickets(studentDid, ownerDid) {
	const db = await openDocuments({
		key: `tickets:${studentDid}`,
		name: ticketLedgerName(studentDid),
		accessController: studioAccessController(ownerDid)
	});

	const load = async () => {
		const events = await readAll(db);
		studentTicketsStore.update((all) => {
			const next = new Map(all);
			next.set(studentDid, { did: studentDid, db, events });
			return next;
		});
	};

	db.events.on('update', load);
	await load();

	return db;
}

/**
 * @param {string} date
 * @param {number} days
 */
function addDays(date, days) {
	const parsed = new Date(`${date}T00:00:00.000Z`);
	parsed.setUTCDate(parsed.getUTCDate() + days);
	return parsed.toISOString().slice(0, 10);
}
