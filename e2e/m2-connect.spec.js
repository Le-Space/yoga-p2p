// The handshake itself (T2.1). Everything the app can do between two devices
// depends on this working, so it is the one scenario that must never be
// skipped or made conditional.

import { test, expect, connectViaPaste, readPayload, CONNECT_URL } from './fixtures.js';

test.describe('QR handshake', () => {
	test('connects two devices over copy & paste', async ({ alice, bob }) => {
		test.setTimeout(180_000);
		await connectViaPaste(alice, bob);
	});

	test('renders the offer as a scannable QR code', async ({ alice }) => {
		await alice.goto(CONNECT_URL);
		await expect(alice.getByTestId('create-offer')).toBeEnabled({ timeout: 60_000 });
		await alice.getByTestId('create-offer').click();

		const payload = await readPayload(alice);

		// Either a code was rendered, or the app said plainly that the payload is
		// too large for one — never a silently unscannable image.
		const hasImage = await alice.getByTestId('qr-image').isVisible();
		if (hasImage) {
			const src = await alice.getByTestId('qr-image').getAttribute('src');
			expect(src).toMatch(/^data:image\/png;base64,/);
		} else {
			await expect(alice.getByTestId('qr-too-large')).toBeVisible();
			expect(payload.length).toBeGreaterThan(2200);
		}
	});

	test('refuses an offer created by the same device', async ({ alice }) => {
		await alice.goto(CONNECT_URL);
		await expect(alice.getByTestId('create-offer')).toBeEnabled({ timeout: 60_000 });
		await alice.getByTestId('create-offer').click();

		const ownOffer = await readPayload(alice);
		await alice.getByTestId('inbound-payload').fill(ownOffer);
		await alice.getByTestId('submit-inbound').click();

		await expect(alice.getByTestId('connection-status')).toHaveAttribute('data-step', 'failed');
	});

	test('refuses a payload that was tampered with', async ({ alice, bob }) => {
		await alice.goto(CONNECT_URL);
		await bob.goto(CONNECT_URL);
		await expect(alice.getByTestId('create-offer')).toBeEnabled({ timeout: 60_000 });

		await alice.getByTestId('create-offer').click();
		const offer = await readPayload(alice);

		// Flip a character in the middle: the signature covers the payload, so a
		// modified offer must not produce a connection.
		const middle = Math.floor(offer.length / 2);
		const tampered =
			offer.slice(0, middle) + (offer[middle] === 'A' ? 'B' : 'A') + offer.slice(middle + 1);

		await bob.getByTestId('inbound-payload').fill(tampered);
		await bob.getByTestId('submit-inbound').click();

		await expect(bob.getByTestId('connection-status')).toHaveAttribute('data-step', 'failed');
	});
});

test.describe('share flow', () => {
	test('hands the payload to the share sheet when the device has one', async ({ alice }) => {
		await alice.addInitScript(() => {
			// @ts-expect-error — installing the API the desktop browser lacks
			navigator.share = (data) => {
				// @ts-expect-error — test-only channel
				window.__shared = data;
				return Promise.resolve();
			};
		});

		await alice.goto(CONNECT_URL);
		await expect(alice.getByTestId('create-offer')).toBeEnabled({ timeout: 60_000 });
		await alice.getByTestId('create-offer').click();
		const payload = await readPayload(alice);

		await alice.getByTestId('share-payload').click();

		const shared = await alice.evaluate(() => /** @type {any} */ (window).__shared);
		expect(shared.text).toBe(payload);
	});

	test('falls back to the clipboard where there is no share sheet', async ({ alice }) => {
		await alice.goto(CONNECT_URL);
		await expect(alice.getByTestId('create-offer')).toBeEnabled({ timeout: 60_000 });
		await alice.getByTestId('create-offer').click();
		const payload = await readPayload(alice);

		await alice.getByTestId('share-payload').click();

		const clipboard = await alice.evaluate(() => navigator.clipboard.readText());
		expect(clipboard).toBe(payload);
	});
});
