// Opening databases, and remembering which ones this device belongs to.
//
// Every database here is a `documents` store keyed by `_id`, matching the
// schemas in docs/PLAN.md §3. They are created with an OrbitDBAccessController
// whose initial write set is only the creator — grants for other devices are
// added at runtime without the address changing, which is the acl01 pattern
// this project inherits.

import { get } from 'svelte/store';
import { OrbitDBAccessController } from '@orbitdb/core';

import { orbitdbStore } from '../p2p/node.js';

/**
 * Where this device's database addresses are remembered.
 *
 * Addresses, not names: an OrbitDB address encodes the manifest, so reopening
 * by address gets the same database with the same access controller. Reopening
 * by name would create a *new* one under this device's identity — the studio
 * would silently fork on the first reload.
 */
const ADDRESS_STORAGE_KEY = 'yoga-p2p.databases';

/** @returns {Record<string, string>} */
export function storedAddresses() {
	try {
		return JSON.parse(localStorage.getItem(ADDRESS_STORAGE_KEY) ?? '{}');
	} catch {
		return {};
	}
}

/**
 * @param {string} key
 * @param {string} address
 */
export function rememberAddress(key, address) {
	try {
		localStorage.setItem(
			ADDRESS_STORAGE_KEY,
			JSON.stringify({ ...storedAddresses(), [key]: address })
		);
	} catch {
		// Storage blocked — the database still works for this session, it just
		// will not be found again after a reload.
	}
}

export function forgetAddresses() {
	try {
		localStorage.removeItem(ADDRESS_STORAGE_KEY);
	} catch {
		// nothing to clean up
	}
}

/**
 * Open a database this device already knows, or create it.
 *
 * @param {object} options
 * @param {string} options.key how this database is remembered locally
 * @param {string} options.name the database name used when creating it
 * @param {string} [options.address] open this exact address instead of the
 *   remembered one — this is how a paired device joins the studio's databases
 * @returns {Promise<any>} the opened OrbitDB documents store
 */
export async function openDocuments({ key, name, address }) {
	const orbitdb = get(orbitdbStore);
	if (!orbitdb) throw new Error('The node is not running yet.');

	const target = address ?? storedAddresses()[key];

	const db = await orbitdb.open(target ?? name, {
		type: 'documents',
		create: true,
		sync: true,
		// Only the creator may write at first. Everything else is a runtime
		// grant, so the address stays stable as the studio grows.
		AccessController: OrbitDBAccessController({ write: [orbitdb.identity.id] })
	});

	rememberAddress(key, db.address.toString());
	recordReplicationErrors(db);
	openDatabases.set(db.address.toString(), { key, db });

	return db;
}

/**
 * Replication problems OrbitDB reported.
 *
 * OrbitDB's sync emits its failures as `error` events and carries on. Nobody
 * listening means a database that never replicates looks exactly like one with
 * nothing in it — which cost real debugging time once already.
 *
 * @type {{ address: string, message: string, name: string, at: string }[]}
 */
export const replicationErrors = [];

/**
 * Every database this device currently has open, keyed by address.
 *
 * Opening is funnelled through this module, so this is the one place that can
 * answer "what is actually open, and how much is in it" — the question that
 * separates "did not replicate" from "replicated into a different database".
 *
 * @type {Map<string, any>}
 */
export const openDatabases = new Map();

/** @param {any} db */
function recordReplicationErrors(db) {
	db.events.on('error', (/** @type {any} */ error) => {
		replicationErrors.push({
			address: db.address.toString(),
			name: error?.name ?? 'Error',
			message: error?.message ?? String(error),
			at: new Date().toISOString()
		});
		// Bounded: this is a diagnostic, not a log store.
		if (replicationErrors.length > 50) replicationErrors.shift();
		console.warn('OrbitDB replication error', db.address.toString(), error);
	});
}

/**
 * Read every document, sorted by `_id` so two devices holding the same log
 * render the same order.
 *
 * @param {any} db
 * @returns {Promise<any[]>}
 */
export async function readAll(db) {
	const rows = await db.all();
	return rows
		.map((/** @type {any} */ row) => row.value)
		.sort((/** @type {any} */ a, /** @type {any} */ b) => (a._id < b._id ? -1 : 1));
}
