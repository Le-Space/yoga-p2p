// Create-or-recover flow for the WebAuthn passkey identity.
//
// TODO(upstream): this flow only exists as demo code in
// @le-space/orbitdb-identity-provider-webauthn-did (examples/). Once it is
// exported there as an official helper, replace this module with that import.
//
// Recovery order (mirrors the provider's documented layers):
//   1. largeBlob — identity metadata stored inside the passkey itself,
//      readable through a discoverable WebAuthn assertion.
//   2. localStorage — the serialized credential stored at registration time.
//
// The passkey is bound to the page origin (rpId). A credential created on
// localhost cannot be used on simple-todo.le-space.de or an IPFS gateway —
// see the chapter README.
import {
	WebAuthnDIDProvider,
	createDidLargeBlobPayload,
	parseDidLargeBlobPayload,
	writeLargeBlobMetadata,
	readLargeBlobMetadata,
	storeWebAuthnCredential,
	loadWebAuthnCredential,
	clearWebAuthnCredential
} from '@le-space/orbitdb-identity-provider-webauthn-did';

const CREDENTIAL_STORAGE_KEY = 'simpleTodo.webauthnCredential';

/**
 * Register a brand-new passkey and persist its identity metadata for later
 * recovery (largeBlob first, localStorage always).
 *
 * @param {{ userId: string, displayName: string }} options
 * @returns {Promise<any>} the WebAuthn credential for the identity provider
 */
export async function createPasskeyCredential({ userId, displayName }) {
	// The provider's published types mark every option as required and return
	// bare `Object`, although the implementation defaults all of them. Casting
	// at the boundary keeps the rest of the file typed; the typing gap is an
	// upstream item in docs/LIMITS.md, not something to patch locally.
	const credential = /** @type {any} */ (
		await WebAuthnDIDProvider.createCredential(/** @type {any} */ ({ userId, displayName }))
	);

	// localStorage fallback first — it never fails for platform reasons.
	storeWebAuthnCredential(credential, CREDENTIAL_STORAGE_KEY);

	// Best effort: put the metadata into the authenticator's largeBlob so the
	// identity survives a cleared browser profile. Costs one extra WebAuthn
	// prompt right after registration; not every authenticator supports it.
	try {
		// Both functions are called the way they are actually implemented, and both
		// casts exist because 0.4.0's `types/index.d.ts` disagrees with its own
		// `src/`: it declares `createDidLargeBlobPayload(credentialInfo)` and
		// `writeLargeBlobMetadata(credentialId, payload, options?)`, while the
		// implementation takes `(credential, did)` and a single options object
		// (`src/webauthn/large-blob-metadata.js`). Following the types would break at
		// runtime, so the runtime wins and the mismatch is recorded in
		// docs/LIMITS.md §2.2 instead of being papered over here.
		const payload = /** @type {any} */ (createDidLargeBlobPayload)(credential, credential.did);
		await /** @type {any} */ (writeLargeBlobMetadata)({
			credentialId: credential.rawCredentialId,
			payload
		});
	} catch (error) {
		console.warn('largeBlob write skipped (falling back to localStorage only):', error);
	}

	return credential;
}

/**
 * Recover a previously registered passkey identity.
 *
 * @returns {Promise<any | null>} the credential, or null when nothing found
 */
export async function recoverPasskeyCredential() {
	try {
		// Declared as `Promise<unknown>` upstream though it resolves to `{ blob }`.
		const { blob } = /** @type {any} */ (
			await readLargeBlobMetadata(/** @type {any} */ ({ discoverableCredentials: true }))
		);
		if (blob?.length) {
			const payload = /** @type {any} */ (parseDidLargeBlobPayload(blob));
			const credential = payload?.credential ?? payload;
			if (credential?.did) {
				// Refresh the local fallback so the next recovery works offline of largeBlob.
				storeWebAuthnCredential(credential, CREDENTIAL_STORAGE_KEY);
				return credential;
			}
		}
	} catch (error) {
		console.warn('largeBlob recovery unavailable, trying localStorage:', error);
	}

	return loadWebAuthnCredential(CREDENTIAL_STORAGE_KEY);
}

/** True when a serialized credential exists in this browser profile. */
export function hasStoredPasskeyCredential() {
	try {
		return Boolean(loadWebAuthnCredential(CREDENTIAL_STORAGE_KEY));
	} catch {
		return false;
	}
}

/** Remove the locally stored credential (the passkey itself stays on the authenticator). */
export function forgetStoredPasskeyCredential() {
	clearWebAuthnCredential(CREDENTIAL_STORAGE_KEY);
}
