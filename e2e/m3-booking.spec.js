// M3 — booking, from both sides, and the privacy boundary that justifies the
// per-student cut (docs/PLAN.md §3.3).
//
// The last scenario is the important one. It is the reason the design changed,
// and it is worth more than the happy path: if it ever goes green by accident
// — because someone reintroduced a shared database, say — the app is handing
// classmates each other's attendance records again.

import { test, expect, connectViaPaste, onboard } from './fixtures.js';

const READY = { timeout: 90_000 };
const REPLICATED = { timeout: 90_000 };

test.describe('bookings', () => {
	test('Bob books, Alice confirms, Bob cancels', async ({ alice, bob }) => {
		test.setTimeout(420_000);

		await setUpStudio(alice);
		await connectViaPaste(alice, bob);
		await expect(bob.getByTestId('join-status')).toHaveAttribute('data-state', 'joined', READY);

		// --- Bob books a class ------------------------------------------------
		await bob.getByTestId('nav-program').click();
		await expect(bob.locator('[data-course-id="course:vinyasa-mi-18"]')).toBeVisible(REPLICATED);
		await bob.locator('[data-course-id="course:vinyasa-mi-18"]').getByTestId('course-book').click();

		await bob.getByTestId('nav-bookings').click();
		const booking = bob.locator('[data-testid="my-booking"]').first();
		await expect(booking).toHaveAttribute('data-status', 'requested');

		// Until the studio has seen it, "requested" is a local fact and the UI
		// says so — the difference from a server-backed app, where a request
		// either arrived or visibly failed.
		await expect(booking.getByTestId('my-booking-pending')).toBeVisible();

		// --- Alice sees the request and confirms -------------------------------
		await alice.getByTestId('nav-bookings').click();
		const incoming = alice.getByTestId('incoming-booking').first();
		await expect(incoming).toBeVisible(REPLICATED);

		await incoming.getByTestId('booking-confirm').click();

		// The decision travels back into Bob's own database.
		await expect(booking).toHaveAttribute('data-status', 'confirmed', REPLICATED);
		await expect(booking.getByTestId('my-booking-pending')).toHaveCount(0);

		// --- Bob gives the place back -------------------------------------------
		await booking.getByTestId('booking-cancel').click();
		await expect(booking).toHaveAttribute('data-status', 'cancelled');

		// The request disappears from the studio's queue, rather than lingering
		// as something already dealt with.
		await expect(alice.getByTestId('incoming-booking')).toHaveCount(0, REPLICATED);
	});

	test('Bob never sees Carol’s booking', async ({ alice, bob, carol }) => {
		test.setTimeout(600_000);

		await setUpStudio(alice);

		// Both students pair with the studio and book the same class.
		await connectViaPaste(alice, bob);
		await expect(bob.getByTestId('join-status')).toHaveAttribute('data-state', 'joined', READY);
		await bookFirstCourse(bob);

		await connectViaPaste(alice, carol);
		await expect(carol.getByTestId('join-status')).toHaveAttribute('data-state', 'joined', READY);
		await bookFirstCourse(carol);

		// Alice, holding both databases, sees both requests.
		await alice.getByTestId('nav-bookings').click();
		await expect(alice.getByTestId('incoming-booking')).toHaveCount(2, REPLICATED);

		// Bob sees exactly one booking — his own. This is the property the
		// per-student cut exists for: there is no database Bob replicates that
		// contains Carol's attendance, and he was never told an address for one.
		await bob.getByTestId('nav-bookings').click();
		await expect(bob.getByTestId('my-booking')).toHaveCount(1);

		const carolDid = await carol.evaluate(() => window.__yoga.identity());
		const bobSeesCarol = await bob.evaluate(
			async (did) =>
				(await window.__yoga.databases()).some((database) => database.address.includes(did)),
			carolDid
		);
		expect(bobSeesCarol, 'Bob must not hold any database belonging to Carol').toBe(false);

		// And no incoming queue at all: he is not a studio device.
		await expect(bob.getByTestId('incoming-list')).toHaveCount(0);
	});
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
	await page.getByTestId('course-mode').selectOption('recurring');
	await page.getByTestId('course-id').fill('vinyasa-mi-18');
	await page.getByTestId('course-location').selectOption('location:altstadt');
	await page.getByTestId('course-title-de').fill('Vinyasa Flow');
	await page.getByTestId('course-title-en').fill('Vinyasa Flow');
	await page.getByTestId('course-add').click();
	await expect(page.locator('[data-course-id="course:vinyasa-mi-18"]')).toBeVisible();
}

/** @param {import('@playwright/test').Page} page */
async function bookFirstCourse(page) {
	await page.getByTestId('nav-program').click();
	await expect(page.locator('[data-course-id="course:vinyasa-mi-18"]')).toBeVisible(REPLICATED);
	await page.locator('[data-course-id="course:vinyasa-mi-18"]').getByTestId('course-book').click();

	await page.getByTestId('nav-bookings').click();
	await expect(page.getByTestId('my-booking')).toHaveCount(1);
}
