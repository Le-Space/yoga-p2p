// Named browser contexts and the handshake helpers every spec builds on.
//
// Roles follow docs/PLAN.md: alice owns the studio and works location A,
// carol is the front desk at location B, bob is the student who carries his
// own ledger between the two. Each gets its own storage partition, so their
// OrbitDB state and passkey identity never bleed into one another.

import { test as base, expect } from '@playwright/test';
import { addVirtualAuthenticator } from './webauthn.js';

/**
 * `?ice=host` restricts ICE to host candidates: no STUN lookup, no dependency
 * on the CI runner's egress, and a deterministic candidate set. Remote/NAT
 * paths are a benchmark concern (docs/PLAN.md §11), not a PR gate concern.
 */
export const CONNECT_URL = '/connect/?ice=host';

/**
 * @typedef {import('@playwright/test').Page} Page
 */

export const test = base.extend({
	/** The studio owner, location A. */
	alice: async ({ browser }, use) => {
		await use(await newActor(browser));
	},
	/** Front desk, location B. */
	carol: async ({ browser }, use) => {
		await use(await newActor(browser));
	},
	/** Student and sync courier. */
	bob: async ({ browser }, use) => {
		await use(await newActor(browser));
	}
});

/** @param {import('@playwright/test').Browser} browser */
async function newActor(browser) {
	const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
	const page = await context.newPage();
	await addVirtualAuthenticator(page);
	return page;
}

/**
 * Run the full three-step handshake over copy & paste.
 *
 * This is the default for the bulk of the suite: it exercises the same
 * signalling code as the camera path without depending on video decoding, so
 * a failure here is never ambiguous about which layer broke.
 *
 * @param {Page} offerer
 * @param {Page} answerer
 */
export async function connectViaPaste(offerer, answerer) {
	await offerer.goto(CONNECT_URL);
	await answerer.goto(CONNECT_URL);

	await expect(offerer.getByTestId('create-offer')).toBeEnabled({ timeout: 60_000 });
	await expect(answerer.getByTestId('submit-inbound')).toBeEnabled({ timeout: 60_000 });

	await offerer.getByTestId('create-offer').click();
	const offer = await readPayload(offerer);

	await answerer.getByTestId('inbound-payload').fill(offer);
	await answerer.getByTestId('submit-inbound').click();
	const answer = await readPayload(answerer);

	await offerer.getByTestId('inbound-payload').fill(answer);
	await offerer.getByTestId('submit-inbound').click();

	await expect(offerer.getByTestId('connection-status')).toHaveAttribute('data-step', 'connected', {
		timeout: 60_000
	});
	await expect(answerer.getByTestId('connection-status')).toHaveAttribute(
		'data-step',
		'connected',
		{ timeout: 60_000 }
	);
}

/**
 * Wait for a payload to appear and return it.
 *
 * Polls the value rather than reading it once: creating an offer waits for ICE
 * gathering, so the textarea is empty for a moment after the click.
 *
 * @param {Page} page
 */
export async function readPayload(page) {
	const field = page.getByTestId('payload');
	await expect
		.poll(async () => (await field.inputValue()).length, { timeout: 60_000 })
		.toBeGreaterThan(0);
	return field.inputValue();
}

export { expect };
