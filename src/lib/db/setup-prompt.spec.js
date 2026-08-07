// The prompt and the parser have to agree. They are built from the same
// constants for that reason, and these tests are what keeps the arrangement
// honest: a prompt describing a format the parser rejects produces documents
// that are refused for reasons nobody can see.

import { describe, expect, it } from 'vitest';

import { PACKAGE_KINDS, planImport, SETUP_FORMAT } from './import.js';
import { buildSetupPrompt } from './setup-prompt.js';

describe('buildSetupPrompt', () => {
	it('names the exact format the parser requires', () => {
		expect(buildSetupPrompt({ url: 'https://example.org' })).toContain(SETUP_FORMAT);
	});

	it('lists every package kind the editor offers, from the same constant', () => {
		const prompt = buildSetupPrompt({ url: 'https://example.org' });

		for (const kind of PACKAGE_KINDS) expect(prompt).toContain(kind);
	});

	it('carries the example the parser would actually accept', () => {
		// The strongest form this test can take: pull the example back out of the
		// prompt and run it through the parser. If the two ever drift, this fails
		// rather than a studio discovering it.
		const prompt = buildSetupPrompt({ url: 'https://example.org' });
		const example = JSON.parse(prompt.slice(prompt.indexOf('{')));

		const plan = planImport(example);

		expect(plan.refused).toEqual([]);
		expect(plan.packages).toHaveLength(2);
		expect(plan.locations).toHaveLength(1);
		expect(plan.courses).toHaveLength(1);
	});

	it('gives the course a location that resolves to the location it ships', () => {
		// `locationId` in the example has to match the id the parser mints from the
		// location's name, or the example teaches a broken reference.
		const prompt = buildSetupPrompt({ url: 'https://example.org' });
		const plan = planImport(JSON.parse(prompt.slice(prompt.indexOf('{'))));

		expect(plan.courses[0].locationId).toBe(plan.locations[0].id);
	});

	it('says a bare number is euro, because that is where guessing costs money', () => {
		expect(buildSetupPrompt({ url: 'x' })).toMatch(/175/);
		expect(buildSetupPrompt({ url: 'x', locale: 'en' })).toMatch(/one hundred and seventy-five/);
	});

	it('tells the assistant to split a pass that has several prices', () => {
		// Sivananda has four tiers for the same pass. Without this the assistant
		// picks one, and which one is a coin toss.
		expect(buildSetupPrompt({ url: 'x' })).toMatch(/mehrere Preise/);
		expect(buildSetupPrompt({ url: 'x', locale: 'en' })).toMatch(/several prices/);
	});

	it('asks for JSON only, in both languages', () => {
		expect(buildSetupPrompt({ url: 'x' })).toMatch(/JSON-Dokument und sonst nichts/);
		expect(buildSetupPrompt({ url: 'x', locale: 'en' })).toMatch(
			/single JSON document and nothing else/
		);
	});

	it('puts the studio own address in, and copes when there is none yet', () => {
		expect(buildSetupPrompt({ url: 'https://muenchen.sivananda.yoga/' })).toContain(
			'https://muenchen.sivananda.yoga/'
		);
		expect(buildSetupPrompt({ url: '   ' })).toContain('<eure Website>');
	});
});
