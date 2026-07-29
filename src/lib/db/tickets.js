// The ticket ledger — one append-only log per student (docs/PLAN.md §3.4).
//
// Same shape as bookings, and for the same reason: the student carries it
// between locations, which is what makes them the sync courier that keeps
// double-spending honest without a relay (§5).
//
// Who may write is *not* enforced by the access controller here, and that is
// deliberate. The student is admin of their own ledger — they could grant
// themselves write access and forge a redemption. It would buy them nothing:
// the reducer refuses events from devices that are not in the registry
// (`unknown-device`), so a forged event is inert on every device including
// their own. Security lives in the fold, not in the ACL.

import { get, writable } from 'svelte/store';

import { openDocuments, readAll } from './open.js';
import { devicesStore, studioStore } from './registry.js';
import { signEvent } from './ledger-signing.js';
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

/**
 * @param {object} [options]
 * @param {string} [options.address]
 */
export async function openOwnTickets({ address } = {}) {
	const own = get(ownDidStore);
	if (!own) throw new Error('This device has no identity yet.');

	const db = await openDocuments({ key: 'tickets', name: `yoga-tickets-${own}`, address });

	ticketsDbStore.set(db);
	db.events.on('update', () => refreshTickets());
	await refreshTickets();
	await grantStudioDevices();

	return db;
}

export async function refreshTickets() {
	const db = get(ticketsDbStore);
	if (!db) return;
	ticketEventsStore.set(await readAll(db));
}

/** Let the owner and every unrevoked studio device write here. */
export async function grantStudioDevices() {
	const db = get(ticketsDbStore);
	if (!db?.access?.grant) return;

	const current = await db.access.capabilities().catch(() => null);
	const known = new Set([...(current?.write ?? []), ...(current?.admin ?? [])].map(String));

	const writers = [
		get(studioStore)?.ownerDid,
		...get(devicesStore)
			.filter((device) => !device.revokedAt)
			.map((device) => device.deviceDid)
	].filter(Boolean);

	for (const did of writers) {
		if (known.has(did)) continue;
		await db.access.grant('write', did).catch((/** @type {any} */ error) => {
			console.warn('Could not grant a studio device access to the ledger:', error);
		});
	}
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
	await db.put(event);

	return ticketId;
}

/**
 * Open a student's ledger on a studio device.
 *
 * @param {string} studentDid
 * @param {string} address
 */
export async function openStudentTickets(studentDid, address) {
	const db = await openDocuments({
		key: `tickets:${studentDid}`,
		name: `yoga-tickets-${studentDid}`,
		address
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
