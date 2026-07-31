// One access controller for every ticket ledger in a studio.
//
// The books belong to the studio, not to the student (docs/PLAN.md §3.4). That
// single decision is what this module implements, and it turns out to need no new
// protocol at all — only a fixed write list.
//
// An OrbitDB manifest is `{ name, type, accessController }` and nothing else; in
// particular it does not contain the identity of whoever created the database.
// `OrbitDBAccessController({ write })` opens its own keyvalue database under the
// name it is given, guarded by an `IPFSAccessController` over exactly that write
// list — and an IPFS access controller is immutable and content-addressed. So
// with the write list pinned to the studio owner, every device that opens
// `yoga-tickets-<studentDid>` by *name* lands on the same address, whether it is
// the owner, a front-desk device at the other location, or the student. Nobody
// has to be told an address, and two counters that have never met cannot create
// two different ledgers for the same person.
//
// Two consequences worth stating, because they are the reason for the design:
//
//   - `capabilities().admin` is the union of the granted admins and the write
//     list of the underlying IPFS controller (@orbitdb/core's
//     access-controllers/orbitdb.js). The owner is therefore admin of every
//     ledger, and the student is neither admin nor writer — they cannot grant
//     themselves write access to their own ledger, which they could when they
//     created it.
//   - An entry signed by the owner validates with **no replication at all**: the
//     owner's DID is in the immutable manifest, not in a log that has to arrive
//     first. That removes the race in docs/LIMITS.md §1.8 for everything the
//     owner writes. A front-desk device still needs its grant, which is why the
//     grant is one per device rather than one per device per student.

import { get } from 'svelte/store';
import { OrbitDBAccessController } from '@orbitdb/core';

import { orbitdbStore } from '../p2p/node.js';
import { deferCanAppend } from './defer-can-append.js';
import { openDatabases } from './open.js';

/**
 * The shared access-controller database for a studio.
 *
 * One name per studio, so a device granted here can write to every ledger rather
 * than needing a grant per student. Derived from the owner's DID so two studios
 * on one device cannot collide.
 *
 * @param {string} ownerDid
 */
export function studioAclName(ownerDid) {
	return `yoga-acl-${ownerDid}`;
}

/**
 * The access controller every ticket ledger in this studio is opened with.
 *
 * A thin wrapper around the upstream factory: it substitutes the shared name for
 * the per-database one OrbitDB would otherwise pass in. Using the public factory
 * rather than reimplementing it keeps `canAppend`, `grant` and `revoke` exactly
 * as upstream defines them.
 *
 * @param {string} ownerDid
 */
export function studioAccessController(ownerDid) {
	const factory = OrbitDBAccessController({ write: [ownerDid] });

	/** @param {any} params */
	const controller = async (params) => {
		const access = await factory({
			...params,
			address: undefined,
			name: studioAclName(ownerDid)
		});

		// A refusal waits once for the rules, instead of dropping an entry that was
		// merely early (docs/LIMITS.md §1.8). Wrapped rather than reimplemented: the
		// upstream controller keeps deciding *what* is allowed, and this only changes
		// *when* it is asked. `access.events` are the access-control database's own,
		// which is exactly the log whose arrival is being waited for.
		return {
			...access,
			canAppend: deferCanAppend({
				canAppend: (/** @type {any} */ entry) => access.canAppend(entry),
				events: access.events,
				peerCount: countAclPeers
			})
		};
	};

	// OrbitDB reads the type off the factory to write it into the manifest.
	controller.type = OrbitDBAccessController.type;

	return controller;
}

/**
 * How many peers could still send this studio's access rules.
 *
 * Read off any open ledger, because within a studio they all share one controller
 * and therefore one set of peers — and a device belongs to one studio at a time, so
 * there is nothing to disambiguate. Zero means waiting is pointless: nothing is
 * coming.
 */
function countAclPeers() {
	for (const { key, db } of openDatabases.values()) {
		if (key === 'tickets' || key.startsWith('tickets:')) {
			const peers = [...(db.sync?.peers ?? [])];
			if (peers.length > 0) return peers.length;
		}
	}
	return 0;
}

/**
 * Let a device write to every ledger in this studio, or stop it.
 *
 * Called when a device is approved or revoked, not when a ticket is sold: one
 * grant covers every student, present and future. There is nothing to do when
 * this device is not the owner — only the owner is admin here, and a front-desk
 * device attempting the grant would simply be refused.
 *
 * The grant is written into the shared controller of whichever ledger happens to
 * be open, because they are all the *same* database; if none is open, the
 * controller is opened on its own for the purpose.
 *
 * @param {'grant' | 'revoke'} action
 * @param {string} deviceDid
 * @param {string} ownerDid
 */
export async function setLedgerWriteAccess(action, deviceDid, ownerDid) {
	const controller = await openStudioAcl(ownerDid);
	if (!controller) return;

	await controller[action]('write', deviceDid);
}

/**
 * Get at the shared controller, opening a ledger-shaped database if needed.
 *
 * @param {string} ownerDid
 */
async function openStudioAcl(ownerDid) {
	// Any open ledger carries the shared controller, so reuse one rather than
	// opening a second handle on the same database.
	for (const { key, db } of openDatabases.values()) {
		if (key === 'tickets' || key.startsWith('tickets:')) {
			if (db.access?.grant) return db.access;
		}
	}

	const orbitdb = get(orbitdbStore);
	if (!orbitdb) return null;

	// No ledger open — a studio approving its first device before anyone has
	// bought anything. Build the controller from the upstream factory rather than
	// reimplementing grant and revoke: same name and same write list means this is
	// the same database every ledger uses, so a grant made here is the grant they
	// see.
	return studioAccessController(ownerDid)({
		orbitdb,
		identities: orbitdb.identities,
		name: studioAclName(ownerDid)
	});
}
