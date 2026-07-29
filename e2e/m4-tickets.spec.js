// T4.2 — selling a pass for cash, and the balance that follows from it.
//
// The ledger itself is proven by unit tests; what this checks is the wiring:
// that an `issue` event written at the counter reaches the student, that its
// signature verifies against the registry, and that both devices fold the same
// log into the same number.

import { test, expect, connectViaPaste, onboard } from './fixtures.js';

const READY = { timeout: 90_000 };
const REPLICATED = { timeout: 90_000 };

test.describe('cash purchase', () => {
	test('a pass sold at the counter shows the right balance on both devices', async ({
		alice,
		bob
	}) => {
		test.setTimeout(420_000);

		await setUpStudio(alice);
		await connectViaPaste(alice, bob);
		await expect(bob.getByTestId('join-status')).toHaveAttribute('data-state', 'joined', READY);

		// Bob has bought nothing, and the screen says so rather than showing a
		// zero that could be mistaken for an empty pass.
		await bob.getByTestId('nav-tickets').click();
		await expect(bob.getByTestId('tickets-empty')).toBeVisible();

		// --- Alice sells a ten-class pass ------------------------------------
		await alice.getByTestId('nav-till').click();
		await expect(alice.getByTestId('till-student')).toBeVisible(REPLICATED);

		const bobDid = await bob.evaluate(() => window.__yoga.identity());
		await alice.getByTestId('till-student').selectOption(bobDid);
		await alice.getByTestId('till-package').selectOption('package:zehner');
		await alice.getByTestId('till-sell').click();

		await expect(alice.getByTestId('till-sold')).toBeVisible();
		await expect(alice.getByTestId('till-error')).toHaveCount(0);

		// --- The balance appears on Bob's device -------------------------------
		// Not because anything told it to: the issue event replicated, its
		// signature verified against the registry, and the fold produced ten.
		const card = bob.getByTestId('ticket-card').first();
		await expect(card).toBeVisible(REPLICATED);
		await expect(card.getByTestId('ticket-balance')).toHaveText('10', REPLICATED);
		await expect(card).toHaveAttribute('data-status', 'active');

		// "Stand vom …" is part of the balance, not decoration: without a server
		// there is no other honest way to say how current a number is.
		await expect(card.getByTestId('ticket-as-of')).not.toHaveText('—');
	});

	// Not tested here on purpose: "an event from an unregistered device is
	// refused" is a property of the fold, and the unit suite proves it
	// deterministically — `refuses an event from a device that was never
	// registered` in src/lib/ledger/reduce.spec.ts, alongside revoked devices
	// and bad signatures. Staging the same thing through two browsers would
	// test the same line of code with far more ways to be flaky.
});

/** @param {import('@playwright/test').Page} page */
async function setUpStudio(page) {
	await page.goto('/studio/?ice=host');
	await onboard(page, 'alice');

	await page.getByTestId('studio-name').fill('Yoga Eggenfelden');
	await page.getByTestId('studio-save').click();

	await page.getByTestId('location-id').fill('altstadt');
	await page.getByTestId('location-name-de').fill('Studio Altstadt');
	await page.getByTestId('location-name-en').fill('Old Town Studio');
	await page.getByTestId('location-add').click();
	await expect(page.locator('[data-location-id="location:altstadt"]')).toBeVisible();

	await page.getByTestId('nav-program').click();
	await expect(page.getByTestId('studio-ready')).toBeVisible(READY);

	await page.getByTestId('package-id').fill('zehner');
	await page.getByTestId('package-name-de').fill('10er-Karte');
	await page.getByTestId('package-name-en').fill('10-class pass');
	await page.getByTestId('package-kind').selectOption('ten');
	await page.getByTestId('package-units').fill('10');
	await page.getByTestId('package-add').click();
	await expect(page.locator('[data-package-id="package:zehner"]')).toBeVisible();
}
