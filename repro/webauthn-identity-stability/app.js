// Minimal reproduction: does a WebAuthn-backed OrbitDB identity keep the same
// identity *document* across page loads?
//
// Deliberately tiny. No app, no UI framework, no libp2p transport, no
// replication — a passkey, an OrbitDB instance and one identity. If the hash
// below changes between loads, nothing above this layer can replicate reliably.

import { createHelia } from 'helia';
import { createOrbitDB, Identities, useIdentityProvider } from '@orbitdb/core';
import {
	WebAuthnDIDProvider,
	OrbitDBWebAuthnIdentityProviderFunction,
	storeWebAuthnCredential,
	loadWebAuthnCredential
} from '@le-space/orbitdb-identity-provider-webauthn-did';

const STORAGE_KEY = 'repro.webauthnCredential';

/**
 * The one variable under test. `?encryptKeystore=false` runs the same flow
 * with the option off, to show whether it is implicated.
 */
const params = new URLSearchParams(location.search);
const encryptKeystore = params.get('encryptKeystore') !== 'false';

async function credential() {
	const existing = loadWebAuthnCredential(STORAGE_KEY);
	if (existing) return { credential: existing, created: false };

	const fresh = await WebAuthnDIDProvider.createCredential({
		userId: 'repro@example.com',
		displayName: 'Repro'
	});
	storeWebAuthnCredential(fresh, STORAGE_KEY);
	return { credential: fresh, created: true };
}

async function run() {
	const { credential: webauthnCredential, created } = await credential();

	try {
		useIdentityProvider(OrbitDBWebAuthnIdentityProviderFunction);
	} catch {
		// already registered
	}

	// Explicit start: OrbitDB touches the blockstore straight away, and an
	// unstarted Helia fails with a bare "Not started".
	const helia = await createHelia({ start: false });
	await helia.start();
	const identities = await Identities({ ipfs: helia });
	const identity = await identities.createIdentity({
		provider: OrbitDBWebAuthnIdentityProviderFunction({
			webauthnCredential,
			encryptKeystore
		})
	});

	const orbitdb = await createOrbitDB({ ipfs: helia, identities, identity });

	// The two values that matter:
	//   id   — the DID. Expected to be stable, and is.
	//   hash — the identity document every entry points at. Expected to be
	//          stable, and is not.
	const { id, publicKey, type, signatures, hash } = orbitdb.identity;

	return {
		credentialCreatedThisLoad: created,
		encryptKeystore,
		id,
		publicKey,
		type,
		// The signatures are the prime suspect: a randomised signature scheme
		// cannot produce a stable content address, no matter how stable the key is.
		signatures,
		hash
	};
}

run().then(
	(result) => {
		window.__repro = result;
		document.body.textContent = JSON.stringify(result, null, 2);
	},
	(error) => {
		window.__repro = { error: error?.message ?? String(error) };
		document.body.textContent = 'FAILED: ' + (error?.stack ?? error);
	}
);
