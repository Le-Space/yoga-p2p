// Scaffold gate (T0.1/T0.2): the shell, the theme and the language switch.
// Every later milestone adds its own m*-spec; this one keeps the foundation
// from rotting.

import { test, expect, onboard } from './fixtures.js';

test.describe('app shell', () => {
	test('the front page names both ways in, and the handbook', async ({ alice }) => {
		await alice.goto('/');

		// Somebody arriving here has two questions — what is this, and where do I
		// start — and neither is answered by a list of milestones, which is what this
		// page used to show on a live domain.
		await expect(alice.getByTestId('start-intro')).toBeVisible();
		await expect(alice.getByTestId('start-studio')).toBeVisible();
		await expect(alice.getByTestId('start-student')).toBeVisible();

		// There is nobody to ring when something is unclear, so the way to the
		// handbook belongs on the page before anyone needs it.
		await expect(alice.getByTestId('start-handbook')).toHaveAttribute('href', /handbuch/);
	});

	test('the app is installable, and the pieces that make it so are served', async ({ alice }) => {
		// Installability breaks silently: a manifest that 404s or an icon that moved
		// costs nothing at build time and quietly turns the app back into a web page.
		// So the files are fetched rather than assumed.
		await alice.goto('/?ice=host');

		const manifestHref = await alice.getAttribute('link[rel="manifest"]', 'href');
		expect(manifestHref).toBeTruthy();

		const manifest = await alice.evaluate(async (href) => {
			const response = await fetch(/** @type {string} */ (href));
			return response.ok ? await response.json() : null;
		}, manifestHref);

		expect(manifest).not.toBeNull();
		expect(manifest.display).toBe('standalone');
		// Landscape matters here: an iPad at a front desk does not stand upright.
		expect(manifest.orientation).toBe('any');

		// A maskable icon is what stops Android drawing the logo in a white circle.
		const purposes = manifest.icons.map((/** @type {any} */ icon) => icon.purpose ?? '');
		expect(purposes).toContain('maskable');

		// Every icon actually reachable, not merely listed.
		for (const icon of manifest.icons) {
			const ok = await alice.evaluate(
				async (src) => (await fetch(src, { method: 'HEAD' })).ok,
				new URL(icon.src, new URL(manifestHref ?? '/', alice.url())).pathname
			);
			expect(ok, `icon ${icon.src}`).toBe(true);
		}
	});

	test('the imprint and privacy statement are reachable without an identity', async ({ alice }) => {
		// Before any passkey exists, and without ever creating one. A legal notice
		// behind an identity gate is not a legal notice — and it has to be on every
		// page, which is why the link is in the footer rather than the front page.
		await alice.goto('/program/?ice=host');
		await expect(alice.getByTestId('onboarding')).toBeVisible({ timeout: 90_000 });
		await alice.getByTestId('nav-legal').click();

		await expect(alice.getByTestId('legal-imprint')).toBeVisible();
		await expect(alice.getByTestId('legal-privacy')).toBeVisible();

		// The two claims this page exists to make, and the one it must not overstate.
		const text = await alice.getByTestId('legal-privacy').textContent();
		expect(text).toMatch(/IPFS/);
		expect(text).toMatch(/STUN/);
	});

	// Language follows the device before anything else, so the locale is set on
	// the context rather than assumed. Both directions are checked: a German
	// browser must not land in English, and an English one must not land in
	// German just because the studio is German.
	for (const { locale, expected } of [
		{ locale: 'de-DE', expected: 'Yoga-Buchung' },
		{ locale: 'en-GB', expected: 'Yoga booking' }
	]) {
		test(`follows the browser language ${locale}`, async ({ browser }) => {
			const context = await browser.newContext({ locale });
			const page = await context.newPage();
			await page.goto('/');

			await expect(page.getByTestId('app-name')).toHaveText(expected);
			await context.close();
		});
	}

	test('switches the whole shell to English and keeps it after a reload', async ({ browser }) => {
		const context = await browser.newContext({ locale: 'de-DE' });
		const page = await context.newPage();

		await page.goto('/');
		await expect(page.getByTestId('app-name')).toHaveText('Yoga-Buchung');

		await page.getByTestId('language-en').click();
		await expect(page.getByTestId('app-name')).toHaveText('Yoga booking');

		// An explicit choice must outrank the browser preference, not be reset by it.
		await page.reload();
		await expect(page.getByTestId('app-name')).toHaveText('Yoga booking');

		await context.close();
	});
});

test.describe('theme', () => {
	test('follows the system preference on first visit', async ({ browser }) => {
		const context = await browser.newContext({ colorScheme: 'light' });
		const page = await context.newPage();
		await page.goto('/');

		await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
		await context.close();
	});

	test('toggles and persists the choice', async ({ alice }) => {
		await alice.goto('/');
		const html = alice.locator('html');
		const before = await html.getAttribute('data-theme');

		await alice.getByTestId('theme-toggle').click();
		const after = await html.getAttribute('data-theme');
		expect(after).not.toBe(before);

		await alice.reload();
		await expect(html).toHaveAttribute('data-theme', /** @type {string} */ (after));
	});

	test('never paints the wrong theme first', async ({ browser }) => {
		// The inline script in app.html must set the attribute before the first
		// stylesheet applies. Reading it on DOMContentLoaded — before hydration —
		// is what proves there is no flash: if the attribute were set by the
		// component, it would still be missing at this point.
		const context = await browser.newContext({ colorScheme: 'dark' });
		const page = await context.newPage();

		await page.goto('/', { waitUntil: 'commit' });
		const themeAtParse = await page.evaluate(() => {
			return new Promise((resolve) => {
				if (document.readyState !== 'loading') {
					resolve(document.documentElement.dataset.theme);
					return;
				}
				document.addEventListener('DOMContentLoaded', () =>
					resolve(document.documentElement.dataset.theme)
				);
			});
		});

		expect(themeAtParse).toBe('dark');
		await context.close();
	});
});

test.describe('ticket balance', () => {
	test('says plainly that nothing has been bought yet', async ({ bob }) => {
		test.setTimeout(180_000);

		// This screen used to render sample data. It now folds the device's real
		// ledger, so a device that has bought nothing shows nothing — and says so,
		// rather than a zero that could be mistaken for a used-up pass.
		await bob.goto('/tickets/?ice=host');
		await onboard(bob, 'bob');

		await expect(bob.getByTestId('tickets-empty')).toBeVisible();
		await expect(bob.getByTestId('ticket-card')).toHaveCount(0);
	});

	// The balance card's other states — units counting down, "Stand vom …", and
	// the fork alarm with both signed events as proof — are covered where they
	// can be produced for real: m4-tickets.spec.js for a bought pass, and the
	// fork alarm with T4.4. Rendering them from fixtures proved the component,
	// not the app.
});
