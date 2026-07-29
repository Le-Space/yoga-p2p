// M1 — registry and programme (T1.1, T1.2).
//
// The acceptance criteria come straight from docs/PLAN.md: Alice creates two
// locations, three open classes, one series (twice weekly over five weeks with
// one date struck) and five packages; bilingual; and all of it survives a
// reload.

import { test, expect } from './fixtures.js';

const READY = { timeout: 90_000 };

test.describe('registry and programme', () => {
	test('Alice sets up a studio and it survives a reload', async ({ alice }) => {
		test.setTimeout(240_000);

		await onboard(alice);

		// --- studio and two locations -------------------------------------
		await alice.getByTestId('studio-name').fill('Yoga Eggenfelden');
		await alice.getByTestId('studio-save').click();

		await addLocation(alice, { id: 'altstadt', de: 'Studio Altstadt', en: 'Old Town Studio' });
		await addLocation(alice, { id: 'west', de: 'Studio West', en: 'West Studio' });

		await expect(alice.getByTestId('location-item')).toHaveCount(2);

		// The owner DID is what every later signature is verified against, so it
		// has to be real rather than a placeholder.
		await expect(alice.getByTestId('owner-did')).toContainText('did:');

		// --- three open classes -------------------------------------------
		await alice.goto('/program/');
		await expect(alice.getByTestId('studio-ready')).toBeVisible(READY);

		await addRecurringCourse(alice, {
			id: 'vinyasa-mi-18',
			location: 'location:altstadt',
			de: 'Vinyasa Flow',
			en: 'Vinyasa Flow',
			weekday: '3'
		});
		await addRecurringCourse(alice, {
			id: 'hatha-mo-09',
			location: 'location:altstadt',
			de: 'Hatha Morgen',
			en: 'Morning Hatha',
			weekday: '1'
		});
		await addRecurringCourse(alice, {
			id: 'yin-fr-19',
			location: 'location:west',
			de: 'Yin Yoga',
			en: 'Yin Yoga',
			weekday: '5'
		});

		await expect(alice.getByTestId('course-item')).toHaveCount(3);

		// --- one series, twice weekly, five weeks, one date struck ---------
		await alice.getByTestId('course-mode').selectOption('series');
		await alice.getByTestId('course-id').fill('anfaenger-h26');
		await alice.getByTestId('course-location').selectOption('location:altstadt');
		await alice.getByTestId('course-title-de').fill('Anfängerkurs Herbst');
		await alice.getByTestId('course-title-en').fill('Beginners course, autumn');
		await alice.getByTestId('course-price').fill('95');

		await alice.getByTestId('series-start').fill('2026-09-08');
		await alice.getByTestId('series-weeks').fill('5');
		// Tuesday and Thursday; the default already selects them, so assert rather
		// than click blindly.
		await expect(alice.getByTestId('series-weekday-2')).toHaveAttribute('aria-pressed', 'true');
		await expect(alice.getByTestId('series-weekday-4')).toHaveAttribute('aria-pressed', 'true');

		await alice.getByTestId('series-generate').click();
		await expect(alice.getByTestId('series-session')).toHaveCount(10);

		// Strike a holiday. The series must get shorter, not roll into a sixth week.
		await alice.getByTestId('series-drop-2026-09-24').click();
		await expect(alice.getByTestId('series-session')).toHaveCount(9);

		await alice.getByTestId('course-add').click();

		const series = alice.locator('[data-course-id="course:anfaenger-h26"]');
		await expect(series).toBeVisible();
		await expect(series).toHaveAttribute('data-sessions', '9');
		await expect(series).toHaveAttribute('data-mode', 'series');

		// --- five packages -------------------------------------------------
		await addPackage(alice, { id: 'einzel', de: 'Einzelkarte', kind: 'single', units: '1' });
		await addPackage(alice, { id: 'woche', de: 'Wochenkarte', kind: 'week', units: '' });
		await addPackage(alice, { id: 'zehner', de: '10er-Karte', kind: 'ten', units: '10' });
		await addPackage(alice, { id: 'monat', de: 'Monatskarte', kind: 'month', units: '' });
		await addPackage(alice, { id: 'jahr', de: 'Jahreskarte', kind: 'year', units: '' });

		await expect(alice.getByTestId('package-item')).toHaveCount(5);

		// --- persistence (T1.1) ---------------------------------------------
		// A reload must not cost a WebAuthn interaction and must not lose data:
		// the blockstore is on IndexedDB and the database address is remembered.
		await alice.reload();
		await expect(alice.getByTestId('studio-ready')).toBeVisible(READY);

		await expect(alice.getByTestId('course-item')).toHaveCount(4);
		await expect(alice.getByTestId('package-item')).toHaveCount(5);
		await expect(alice.locator('[data-course-id="course:anfaenger-h26"]')).toHaveAttribute(
			'data-sessions',
			'9'
		);

		await alice.goto('/studio/');
		await expect(alice.getByTestId('studio-ready')).toBeVisible(READY);
		await expect(alice.getByTestId('studio-name')).toHaveValue('Yoga Eggenfelden');
		await expect(alice.getByTestId('location-item')).toHaveCount(2);
	});

	test('content is bilingual and follows the language switch', async ({ alice }) => {
		test.setTimeout(180_000);

		await onboard(alice);
		await addLocation(alice, { id: 'altstadt', de: 'Studio Altstadt', en: 'Old Town Studio' });

		// Set the language rather than assume it: the app follows the device, and
		// the test browser is en-US. Content fields are `{ de, en }` objects, so
		// the switch has to move the *data*, not just the chrome.
		await alice.getByTestId('language-de').click();
		await expect(alice.getByTestId('location-item')).toContainText('Studio Altstadt');

		await alice.getByTestId('language-en').click();
		await expect(alice.getByTestId('location-item')).toContainText('Old Town Studio');

		// Falling back rather than rendering nothing is the rule from §7: a
		// location saved with only a German label still has to show up.
		await addLocation(alice, { id: 'west', de: 'Studio West', en: '' });
		await expect(alice.locator('[data-location-id="location:west"]')).toContainText('Studio West');
	});

	test('a deactivated location stays in the registry', async ({ alice }) => {
		test.setTimeout(180_000);

		await onboard(alice);
		await addLocation(alice, { id: 'altstadt', de: 'Studio Altstadt', en: 'Old Town Studio' });

		await alice.getByTestId('location-deactivate').click();

		// Deactivated, not deleted: signed ticket events reference this location
		// and the cash report is grouped by it.
		const location = alice.locator('[data-location-id="location:altstadt"]');
		await expect(location).toBeVisible();
		await expect(location).toHaveAttribute('data-active', 'false');
	});
});

/** @param {import('@playwright/test').Page} page */
async function onboard(page) {
	await page.goto('/studio/');

	await expect(page.getByTestId('onboarding')).toBeVisible(READY);
	await page.getByTestId('onboarding-user-id').fill('alice@example.com');
	await page.getByTestId('onboarding-display-name').fill('Alice');
	await page.getByTestId('onboarding-submit').click();

	await expect(page.getByTestId('studio-ready')).toBeVisible(READY);
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ id: string, de: string, en: string }} location
 */
async function addLocation(page, { id, de, en }) {
	await page.getByTestId('location-id').fill(id);
	await page.getByTestId('location-name-de').fill(de);
	await page.getByTestId('location-name-en').fill(en);
	await page.getByTestId('location-add').click();

	await expect(page.locator(`[data-location-id="location:${id}"]`)).toBeVisible();
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ id: string, location: string, de: string, en: string, weekday: string }} course
 */
async function addRecurringCourse(page, { id, location, de, en, weekday }) {
	await page.getByTestId('course-mode').selectOption('recurring');
	await page.getByTestId('course-id').fill(id);
	await page.getByTestId('course-location').selectOption(location);
	await page.getByTestId('course-title-de').fill(de);
	await page.getByTestId('course-title-en').fill(en);
	await page.getByTestId('course-weekday').selectOption(weekday);
	await page.getByTestId('course-add').click();

	await expect(page.locator(`[data-course-id="course:${id}"]`)).toBeVisible();
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ id: string, de: string, kind: string, units: string }} pkg
 */
async function addPackage(page, { id, de, kind, units }) {
	await page.getByTestId('package-id').fill(id);
	await page.getByTestId('package-name-de').fill(de);
	await page.getByTestId('package-kind').selectOption(kind);
	await page.getByTestId('package-units').fill(units);
	await page.getByTestId('package-add').click();

	await expect(page.locator(`[data-package-id="package:${id}"]`)).toBeVisible();
}
