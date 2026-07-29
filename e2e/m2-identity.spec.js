// The identity document must survive a reload.
//
// Not a cosmetic property: every OrbitDB entry references by hash the identity
// document that signed it, a peer has to resolve that exact document to accept
// the entry, and what it cannot resolve it drops for good. A device whose
// document changes on every load therefore writes history that nobody else can
// ever validate.
//
// The underlying cause is upstream (docs/LIMITS.md §2.2): the provider embeds a
// live WebAuthn assertion in the document, and an assertion is different every
// time. This test guards the local remedy — keep the first document.

import { test, expect, onboard } from './fixtures.js';

test('the identity document survives reloads', async ({ alice }) => {
	test.setTimeout(240_000);

	await alice.goto('/studio/');
	await onboard(alice, 'alice');

	const seen = [];

	for (let load = 0; load < 3; load++) {
		seen.push(
			await alice.evaluate(() => ({
				did: window.__yoga.identity(),
				hash: window.__yoga.identityHash()
			}))
		);

		await alice.reload();
		await expect(alice.getByTestId('studio-ready')).toBeVisible({ timeout: 90_000 });
	}

	expect(new Set(seen.map((s) => s.did)).size, 'DID should be stable').toBe(1);
	expect(new Set(seen.map((s) => s.hash)).size, 'identity document should be stable').toBe(1);
});
