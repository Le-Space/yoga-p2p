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
	await cdp.send('WebAuthn.addVirtualAuthenticator', {
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

	return cdp;
}
