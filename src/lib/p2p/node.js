// Node lifecycle: libp2p → Helia → OrbitDB, plus the Svelte stores the UI
// reads. Everything below the store layer is deliberately plain functions so
// it can be driven from a test without a component.
//
// Persistence is on from the start (docs/PLAN.md §2): a studio device that
// loses its ledger on reload would lose cash receipts, so blocks and OrbitDB
// state go to IndexedDB via level, not to memory.

import { get, writable } from 'svelte/store';

import { createLibp2p } from 'libp2p';
import { createHeliaLight } from 'helia';
import { withBitswap } from '@helia/bitswap';
import { withLibp2p } from '@helia/libp2p';
import { LevelBlockstore } from 'blockstore-level';
import { LevelDatastore } from 'datastore-level';
import { createOrbitDB, Identities, useIdentityProvider } from '@orbitdb/core';
import { OrbitDBWebAuthnIdentityProviderFunction } from '@le-space/orbitdb-identity-provider-webauthn-did';
import * as dagCbor from '@ipld/dag-cbor';

import { createLibp2pConfig } from './libp2p-config.js';
import { createSignalling } from './session.js';

const BLOCKSTORE_NAME = 'yoga-p2p/blocks';
const DATASTORE_NAME = 'yoga-p2p/data';

export const libp2pStore = writable(/** @type {any} */ (null));
export const orbitdbStore = writable(/** @type {any} */ (null));
export const peerIdStore = writable(/** @type {string | null} */ (null));
export const ownDidStore = writable(/** @type {string | null} */ (null));
export const signallingStore = writable(/** @type {any} */ (null));
export const connectedPeersStore = writable(/** @type {string[]} */ ([]));

export const nodeStatusStore = writable(
	/** @type {{ state: 'idle' | 'starting' | 'ready' | 'error', error: string | null }} */ ({
		state: 'idle',
		error: null
	})
);

/** @type {{ libp2p: any, helia: any, orbitdb: any, blockstore: any, datastore: any } | null} */
let running = null;

/**
 * Start the whole stack.
 *
 * @param {object} options
 * @param {any} [options.passkeyCredential] the WebAuthn credential backing the
 *   OrbitDB identity. Required in normal use — without it the node has no DID
 *   that other devices can grant write access to.
 */
export async function startNode({ passkeyCredential = null } = {}) {
	if (running) return running;

	nodeStatusStore.set({ state: 'starting', error: null });

	try {
		// The transport needs a way to look up verified sessions, but sessions
		// need the node. The indirection resolves that: config asks the holder,
		// the holder is filled once signalling exists.
		/** @type {{ current: any }} */
		const signallingHolder = { current: null };

		const libp2p = await createLibp2p(
			createLibp2pConfig({
				getOutboundSession: (peerId) => signallingHolder.current?.getOutboundSession(peerId)
			})
		);

		const signalling = createSignalling(libp2p);
		signallingHolder.current = signalling;

		const blockstore = new LevelBlockstore(BLOCKSTORE_NAME);
		const datastore = new LevelDatastore(DATASTORE_NAME);
		await datastore.open();

		// Composed by hand rather than via createHelia: the default composition
		// adds trustless HTTP gateways and delegated routing, which would fetch
		// blocks over the public internet. Bitswap over the QR-negotiated
		// connection must be the only way a block can travel.
		const helia = withBitswap(
			withLibp2p(createHeliaLight({ blockstore, datastore, codecs: [dagCbor] }), libp2p)
		);
		await helia.start();

		const orbitdb = await createOrbitDBInstance(helia, passkeyCredential);

		running = { libp2p, helia, orbitdb, blockstore, datastore };

		libp2pStore.set(libp2p);
		orbitdbStore.set(orbitdb);
		peerIdStore.set(libp2p.peerId.toString());
		signallingStore.set(signalling);
		trackConnections(libp2p);
		nodeStatusStore.set({ state: 'ready', error: null });

		return running;
	} catch (/** @type {any} */ error) {
		nodeStatusStore.set({ state: 'error', error: error?.message ?? String(error) });
		throw error;
	}
}

export async function stopNode() {
	if (!running) return;

	get(signallingStore)?.close();
	await running.orbitdb?.stop?.();
	await running.helia?.stop?.();
	await running.libp2p?.stop?.();
	await running.datastore?.close?.();
	await running.blockstore?.close?.();

	running = null;
	libp2pStore.set(null);
	orbitdbStore.set(null);
	peerIdStore.set(null);
	ownDidStore.set(null);
	signallingStore.set(null);
	connectedPeersStore.set([]);
	nodeStatusStore.set({ state: 'idle', error: null });
}

/**
 * OrbitDB on a passkey-backed DID identity.
 *
 * The provider is registered globally as well as used locally: without the
 * registration, this device could create its own webauthn identity but could
 * not verify entries signed by another device's (docs/PLAN.md §3.1).
 *
 * @param {any} helia
 * @param {any} passkeyCredential
 */
async function createOrbitDBInstance(helia, passkeyCredential) {
	if (!passkeyCredential) {
		ownDidStore.set(null);
		return createOrbitDB({ ipfs: helia });
	}

	try {
		useIdentityProvider(OrbitDBWebAuthnIdentityProviderFunction);
	} catch {
		// Already registered in this page — harmless.
	}

	const identities = await Identities({ ipfs: helia });
	const identity = await identities.createIdentity({
		provider: OrbitDBWebAuthnIdentityProviderFunction(
			// Both casts are upstream typing gaps, not looseness of our own: the
			// provider types mark every option required though it defaults them,
			// and @orbitdb/core's createOrbitDB signature omits `identities`
			// although the implementation accepts it. Recorded in docs/LIMITS.md.
			/** @type {any} */ ({
				webauthnCredential: passkeyCredential,
				// One WebAuthn prompt per session: the signing key is encrypted at
				// rest and unlocked once through the passkey.
				encryptKeystore: true
			})
		)
	});

	ownDidStore.set(identity.id);
	return createOrbitDB(/** @type {any} */ ({ ipfs: helia, identities, identity }));
}

/** @param {any} libp2p */
function trackConnections(libp2p) {
	const update = () =>
		connectedPeersStore.set([
			...new Set(libp2p.getConnections().map((/** @type {any} */ c) => c.remotePeer.toString()))
		]);

	libp2p.addEventListener('connection:open', update);
	libp2p.addEventListener('connection:close', update);
	update();
}
