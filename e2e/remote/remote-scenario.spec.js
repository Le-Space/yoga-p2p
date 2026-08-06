// Two devices that were never in the same process, connected only by a code
// somebody carried between them — and no `?ice=host`.
//
// The ordinary suite cannot make this claim. It runs both devices in one
// browser on one machine with ICE restricted to host candidates, which is what
// makes it fast and deterministic and also what makes it silent about the one
// thing this application is: no server, no relay, two devices finding each
// other directly. See Le-Space/yogasuci#38.
//
// This run changes exactly two things, and nothing else:
//
//   1. Each device comes from its own browser, reached over a websocket rather
//      than launched here. Locally both servers happen to be on this machine;
//      in CI one of them is an Aleph VM in another network. The scenario cannot
//      tell the difference, which is the point — swapping the provider is then
//      a change of address, not a change of test.
//   2. `/connect/` without `?ice=host`, so STUN actually runs.
//
// What it deliberately does not do yet: judge *why* a connection failed.
// "Broken" and "these two networks cannot do it without TURN" are different
// outcomes that look identical from here, and telling them apart needs the
// candidate types from both sides (#38, step 4). Until that exists this run is
// honest only about success — a failure here means "look at it", not "it is
// broken".

import { expect, test } from '@playwright/test';

import { connectViaPaste, newActor, onboard } from '../fixtures.js';
import { createConnectedBrowser, createServedBrowser } from './providers.mjs';

// No `?ice=host` anywhere in this file, and that is the whole reason it exists.
//
// Note where the mode is *not* decided: not by the connect URL. `iceMode()`
// reads the query string once and then keeps the answer in sessionStorage, and
// a page that already runs a node navigates in-app without any query string at
// all. So the mode is set by the *first* load of the run - this one - and every
// later navigation inherits it. Passing `?ice=host` to a connect helper looks
// like it would change something and does not, which is why this file asserts
// the mode instead of trusting a URL.
const STUDIO_URL = '/studio/';

const READY = { timeout: 120_000 };

test.describe('two browsers, one carried code', () => {
	test('a device in another browser joins the studio through a pasted invite', async () => {
		test.setTimeout(600_000);

		// Device B is the seam. Given an endpoint it is somewhere else entirely;
		// without one it is a second server on this machine, which still proves the
		// topology because it is still reached by connecting rather than launching.
		const deviceA = await createServedBrowser();
		const deviceB = process.env.REMOTE_WS_ENDPOINT
			? await createConnectedBrowser({
					wsEndpoint: process.env.REMOTE_WS_ENDPOINT,
					secret: process.env.REMOTE_SECRET,
					evidence: { crn: process.env.REMOTE_CRN_NAME ?? null }
				})
			: await createServedBrowser();

		try {
			const alice = await newActor(deviceA.browser);
			const bob = await newActor(deviceB.browser);

			// --- the studio exists before anybody connects to it ---------------
			await alice.goto(STUDIO_URL);
			await onboard(alice, 'alice');
			await alice.getByTestId('studio-name').fill('Yoga Eggenfelden');
			await alice.getByTestId('studio-save').click();
			await alice.getByTestId('location-id').fill('altstadt');
			await alice.getByTestId('location-name-de').fill('Studio Altstadt');
			await alice.getByTestId('location-name-en').fill('Old Town Studio');
			await alice.getByTestId('location-add').click();
			await expect(alice.locator('[data-location-id="location:altstadt"]')).toBeVisible(READY);

			// Bob has to exist as a device before he can be introduced to anything.
			await bob.goto(STUDIO_URL);
			await onboard(bob, 'bob');

			// --- the code travels, and that is the only introduction ------------
			await connectViaPaste(alice, bob);

			// The premise of this whole file, asserted rather than assumed. The panel
			// drops its network rows when STUN is off, so five rows is the app's own
			// statement that ICE was not restricted to host candidates - read off the
			// screen rather than inferred from a URL.
			//
			// That it discriminates is not taken on trust: `m2-connect.spec.js`
			// asserts exactly two rows on this same panel under `?ice=host`. One
			// suite, both modes, same element.
			await expect(alice.getByTestId('network-status').locator('.line')).toHaveCount(5, READY);
			await expect(bob.getByTestId('network-status').locator('.line')).toHaveCount(5, READY);

			// --- and something actually crosses ---------------------------------
			// Connected is not the claim. Replicated is: Bob's device reads a studio
			// it learned about from Alice and from nothing else.
			await expect(bob.getByTestId('join-status')).toHaveAttribute('data-state', 'joined', READY);

			// Recorded rather than asserted. These are the states that make a stalled
			// handshake diagnosable at all, and on a green run they are the baseline
			// a red one gets compared against.
			const webrtc = {
				alice: await alice.evaluate(() => window.__yoga.webrtc()),
				bob: await bob.evaluate(() => window.__yoga.webrtc())
			};

			console.log(
				`remote scenario ok — device B: ${JSON.stringify(deviceB.evidence)}\n` +
					`webrtc: ${JSON.stringify(webrtc)}`
			);
		} finally {
			await deviceA.close();
			await deviceB.close();
		}
	});
});
