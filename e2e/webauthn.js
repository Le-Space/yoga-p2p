// CDP virtual authenticator, so passkey flows run in CI without a real
// security key or Touch ID.
//
// The provider itself must never grow a test mode (CLAUDE.md) — the emulator
// is the seam. This helper mirrors the one used in the E2E tests of
// Le-Space/orbitdb-identity-provider-webauthn-did; if that repository ever
// exports it, delete this file and import it instead rather than letting the
// two drift.

/**
 * Attach a virtual platform authenticator to a page's browser context.
 *
 * `hasLargeBlob` matters: the passkey recovery path stores identity metadata
 * inside the credential, and without it that path silently falls back to
 * localStorage and stops being tested.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function addVirtualAuthenticator(page) {
	const cdp = await page.context().newCDPSession(page);

	await cdp.send('WebAuthn.enable');
	const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
		options: {
			protocol: 'ctap2',
			ctap2Version: 'ctap2_1',
			transport: 'internal',
			hasResidentKey: true,
			hasUserVerification: true,
			isUserVerified: true,
			hasLargeBlob: true,
			automaticPresenceSimulation: true
		}
	});

	// The id is carried on the session so callers that only keep the CDP handle can
	// still address the authenticator. Both are needed for the recovery tests.
	return Object.assign(cdp, { authenticatorId });
}

/**
 * Read the passkeys out of a virtual authenticator.
 *
 * This is how "the same person, a different device" gets modelled: a passkey lives
 * in the authenticator, not in the browser profile, so restoring onto a fresh
 * profile means carrying the credential — and its `largeBlob`, which is where the
 * identity metadata lives — rather than copying any app storage.
 *
 * @param {any} cdp a session from addVirtualAuthenticator
 */
export async function exportCredentials(cdp) {
	const { credentials } = await cdp.send('WebAuthn.getCredentials', {
		authenticatorId: cdp.authenticatorId
	});
	return credentials;
}

/**
 * Put passkeys into a virtual authenticator.
 *
 * @param {any} cdp a session from addVirtualAuthenticator
 * @param {any[]} credentials from exportCredentials
 */
export async function importCredentials(cdp, credentials) {
	for (const credential of credentials) {
		await cdp.send('WebAuthn.addCredential', {
			authenticatorId: cdp.authenticatorId,
			credential
		});
	}
}
