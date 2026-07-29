// Accessibility gate. Both themes, every screen that exists — contrast is the
// check that catches a derived dark value that looked fine but is not readable
// (docs/DESIGN.md marks which values are derived rather than brand-defined).

import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

// /studio and /program are checked in their onboarding state — that is the
// first screen a real owner sees, and a form is exactly where contrast and
// labelling go wrong.
const SCREENS = ['/', '/tickets/', '/connect/?ice=host', '/studio/', '/program/'];
const THEMES = /** @type {const} */ (['light', 'dark']);

for (const theme of THEMES) {
	for (const screen of SCREENS) {
		test(`${screen} has no accessibility violations in ${theme} mode`, async ({ alice }) => {
			await alice.addInitScript((value) => {
				localStorage.setItem('theme', value);
			}, theme);

			await alice.goto(screen);
			await expect(alice.locator('html')).toHaveAttribute('data-theme', theme);

			const results = await new AxeBuilder({ page: alice })
				.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
				.analyze();

			// Compare a compact projection rather than the raw axe output: a single
			// contrast miss otherwise prints hundreds of lines and buries which
			// token is actually at fault.
			const findings = results.violations.flatMap((violation) =>
				violation.nodes.map((node) => ({
					rule: violation.id,
					target: node.target.join(' '),
					...(node.any[0]?.data ?? {})
				}))
			);

			expect(findings).toEqual([]);
		});
	}
}
