import { describe, expect, it } from 'vitest';

import { buildExport, countEvents, EXPORT_FORMAT, exportFilename } from './export.js';

const base = { exportedBy: 'did:key:alice', exportedAt: '2026-08-05T09:41:07.000Z' };

describe('buildExport', () => {
	it('stamps the format and who produced it', () => {
		const bundle = buildExport(base);

		expect(bundle.format).toBe(EXPORT_FORMAT);
		expect(bundle.exportedBy).toBe('did:key:alice');
		expect(bundle.exportedAt).toBe('2026-08-05T09:41:07.000Z');
	});

	it('omits parts that were not asked for rather than emptying them', () => {
		// An empty `devices: []` in a student's export would read as "this studio has
		// no devices" instead of "nobody asked". A backup that implies things is worse
		// than a smaller one.
		const bundle = buildExport({ ...base, ledgers: { 'did:key:bob': [] } });

		expect('devices' in bundle).toBe(false);
		expect('studio' in bundle).toBe(false);
		expect(bundle.ledgers).toEqual({ 'did:key:bob': [] });
	});

	it('keeps parts that were passed, including deliberately empty ones', () => {
		const bundle = buildExport({ ...base, devices: [] });

		expect('devices' in bundle).toBe(true);
		expect(bundle.devices).toEqual([]);
	});

	it('carries signed events through untouched', () => {
		const issue = { _id: 'ticket:1', type: 'issue', sig: 'abc' };
		const bundle = buildExport({ ...base, ledgers: { 'did:key:bob': [issue] } });

		// The signature is the whole point of the export: a balance proves nothing,
		// a signed event can be re-verified against the registry without this app.
		expect(bundle.ledgers?.['did:key:bob'][0]).toBe(issue);
	});
});

describe('countEvents', () => {
	it('counts across every student', () => {
		const bundle = buildExport({
			...base,
			ledgers: {
				'did:key:bob': [{ _id: 'a' }, { _id: 'b' }],
				'did:key:carol': [{ _id: 'c' }]
			}
		});

		expect(countEvents(bundle)).toBe(3);
	});

	it('is zero when there are no ledgers at all', () => {
		expect(countEvents(buildExport(base))).toBe(0);
	});
});

describe('exportFilename', () => {
	it('sorts chronologically and survives a filesystem', () => {
		expect(exportFilename('yoga-studio', base.exportedAt)).toBe(
			'yoga-studio-2026-08-05T094107.json'
		);
	});
});
