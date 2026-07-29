// Bringing a device into service: passkey → node → registry + programme.
//
// The order matters. OrbitDB's access controller freezes the creator's identity
// into the database manifest, so the passkey has to exist *before* any database
// is opened — otherwise the studio would be owned by a throwaway identity and
// the real owner could never write to it.

import { get, writable } from 'svelte/store';

import { startNode, ownDidStore } from '../p2p/node.js';
import { openRegistry } from '../db/registry.js';
import { openProgram } from '../db/program.js';
import {
	createPasskeyCredential,
	hasStoredPasskeyCredential,
	recoverPasskeyCredential
} from './passkey-identity.js';

/**
 * @typedef {'idle' | 'starting' | 'ready' | 'error'} BootState
 */

export const bootStore = writable(
	/** @type {{ state: BootState, error: string | null }} */ ({
		state: 'idle',
		error: null
	})
);

/** True when this browser profile has a passkey it can come back to. */
export function hasIdentity() {
	return hasStoredPasskeyCredential();
}

/**
 * Register a new passkey and open this device's databases.
 *
 * @param {{ userId: string, displayName: string }} identity
 */
export async function createIdentityAndBoot({ userId, displayName }) {
	return boot(() => createPasskeyCredential({ userId, displayName }));
}

/**
 * Come back with an existing passkey — after a reload, or on a new device
 * whose platform authenticator has synced the credential.
 */
export async function recoverIdentityAndBoot() {
	return boot(async () => {
		const credential = await recoverPasskeyCredential();
		if (!credential) throw new Error('No passkey found on this device.');
		return credential;
	});
}

/**
 * Restore the session on page load without prompting.
 *
 * A reload must not cost the user a WebAuthn interaction, so this only runs
 * when the credential is already in local storage. It is the difference between
 * "the app remembers me" and "the app asks who I am on every refresh".
 */
export async function bootIfIdentityKnown() {
	if (!hasStoredPasskeyCredential()) return false;
	if (get(bootStore).state === 'ready') return true;

	await recoverIdentityAndBoot();
	return true;
}

/** @param {() => Promise<any>} obtainCredential */
async function boot(obtainCredential) {
	bootStore.set({ state: 'starting', error: null });

	try {
		const passkeyCredential = await obtainCredential();
		await startNode({ passkeyCredential });

		if (!get(ownDidStore)) {
			throw new Error('The passkey did not produce a DID.');
		}

		// Both databases open together: the registry is the trust root and the
		// programme is meaningless without the locations it points at.
		await openRegistry();
		await openProgram();

		bootStore.set({ state: 'ready', error: null });
	} catch (/** @type {any} */ error) {
		bootStore.set({ state: 'error', error: error?.message ?? String(error) });
		throw error;
	}
}
