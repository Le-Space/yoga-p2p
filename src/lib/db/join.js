// Joining someone else's studio (T2.2).
//
// A device that scanned a studio's QR code asks the peer for its addresses and
// opens those databases instead of its own. From that moment OrbitDB replicates
// the registry and the programme over the direct WebRTC connection — no relay,
// no server, and nothing else had to be exchanged by hand.
//
// Read-only in every sense that matters: the databases were created with the
// studio owner in their access controller, so a write from here is refused by
// the ACL, not merely hidden by the UI. Gaining write access is a registry
// entry plus a grant (T2.3, T3.1).

import { get, writable } from 'svelte/store';

import { libp2pStore, ownDidStore } from '../p2p/node.js';
import { introduceSelf, requestStudio } from '../p2p/studio-protocol.js';
import { devicesStore, openRegistry, registryDbStore, studioStore } from './registry.js';
import { openProgram, programDbStore } from './program.js';
import { rememberAddress } from './open.js';

/**
 * Devices that have introduced themselves but are not registered yet.
 *
 * Kept in memory only: an introduction is a claim from a peer, and claims do
 * not belong in the registry until the owner has acted on one. Keyed by DID so
 * a device reconnecting does not queue up twice.
 *
 * @type {import('svelte/store').Writable<Map<string, { peerId: string, did: string, label: string, seenAt: string }>>}
 */
export const pendingDevicesStore = writable(new Map());

/** @param {{ peerId: string, did: string, label: string }} hello */
export function rememberPendingDevice(hello) {
	pendingDevicesStore.update((pending) => {
		const next = new Map(pending);
		next.set(hello.did, { ...hello, seenAt: new Date().toISOString() });
		return next;
	});
}

/** @param {string} did */
export function forgetPendingDevice(did) {
	pendingDevicesStore.update((pending) => {
		const next = new Map(pending);
		next.delete(did);
		return next;
	});
}

export const joinStore = writable(
	/** @type {{ state: 'idle' | 'joining' | 'joined' | 'error', error: string | null, studioName: string | null }} */ ({
		state: 'idle',
		error: null,
		studioName: null
	})
);

/**
 * True when this device owns the studio it currently has open.
 *
 * The owner DID is written into the registry once, at creation, so this
 * survives replication: a joining device reads the same document and correctly
 * concludes that it is not the owner.
 */
export function isOwnStudio() {
	const studio = get(studioStore);
	const own = get(ownDidStore);
	// A studio that has not been named yet has no owner recorded, and the only
	// device that can be looking at it is the one that just created it.
	if (!studio?.ownerDid) return true;
	return studio.ownerDid === own;
}

/**
 * True when this device is a registered, unrevoked studio device.
 *
 * The registry is the authority, not local state: a device learns it was
 * approved — or revoked — by replicating the entry the owner wrote. That is the
 * same document the ledger checks signatures against, so the editor a device
 * shows itself and the writes its peers will accept cannot drift apart.
 */
export function isRegisteredDevice() {
	const own = get(ownDidStore);
	if (!own) return false;

	const device = get(devicesStore).find((entry) => entry.deviceDid === own);
	return Boolean(device) && !device.revokedAt;
}

/** Owner, or an approved device: the two ways to hold write access. */
export function canEditProgram() {
	return isOwnStudio() || isRegisteredDevice();
}

/**
 * What this device announces to peers that ask.
 *
 * @returns {import('../p2p/studio-protocol.js').StudioAnnouncement | null}
 */
export function describeOwnStudio() {
	const registry = get(registryDbStore);
	const program = get(programDbStore);
	const studio = get(studioStore);

	if (!registry || !program) return null;

	return {
		protocolVersion: '1.0.0',
		studioName: studio?.name ?? null,
		ownerDid: studio?.ownerDid ?? get(ownDidStore) ?? '',
		registryAddress: registry.address.toString(),
		programAddress: program.address.toString()
	};
}

/**
 * Ask a connected peer for its studio and open it here.
 *
 * @param {string} peerId the peer from the QR handshake
 * @returns {Promise<{ studioName: string | null }>}
 */
export async function joinStudioFromPeer(peerId) {
	const libp2p = get(libp2pStore);
	if (!libp2p) throw new Error('The node is not running.');

	joinStore.set({ state: 'joining', error: null, studioName: null });

	try {
		// Say who we are before asking anything. The studio cannot register a
		// device whose DID it never learned, and the introduction has to happen
		// while the connection is up.
		const ownDid = get(ownDidStore);
		if (ownDid) {
			await introduceSelf(libp2p, peerId, {
				did: ownDid,
				label: navigator.userAgent.slice(0, 80)
			}).catch(() => {
				// A studio that does not speak this protocol is still worth joining.
			});
		}

		const announcement = await requestStudio(libp2p, peerId);
		if (!announcement) {
			throw new Error('That device does not offer a studio.');
		}

		// Remembered before opening: if opening the programme fails halfway, a
		// reload should still find its way back to the studio rather than
		// silently creating a fresh, empty one under this device's identity.
		rememberAddress('registry', announcement.registryAddress);
		rememberAddress('program', announcement.programAddress);

		await openRegistry({ address: announcement.registryAddress });
		await openProgram({ address: announcement.programAddress });

		joinStore.set({
			state: 'joined',
			error: null,
			studioName: announcement.studioName
		});

		return { studioName: announcement.studioName };
	} catch (/** @type {any} */ error) {
		joinStore.set({
			state: 'error',
			error: error?.message ?? String(error),
			studioName: null
		});
		throw error;
	}
}
