import { describe, expect, it } from 'vitest';

import { buildLink, linkOverhead, readLink } from './invite.js';
import { QR_CHARACTER_BUDGET } from './qr.js';

const ORIGIN = 'https://yogasuci.le-space.de';

describe('buildLink', () => {
	it('puts the payload in the fragment, never in the path or query', () => {
		const link = buildLink({ payload: 'abc123', kind: 'invite', origin: ORIGIN });
		const url = new URL(link);

		expect(url.pathname).toBe('/connect');
		expect(url.search).toBe('');
		expect(url.hash).toBe('#i=abc123');
	});

	it('honours a base path, so a site served from a subdirectory still links to itself', () => {
		const link = buildLink({ payload: 'abc', kind: 'invite', origin: ORIGIN, base: '/handbuch' });

		expect(link.startsWith(`${ORIGIN}/handbuch/connect#`)).toBe(true);
	});

	it('distinguishes an invite from the reply travelling back', () => {
		const invite = buildLink({ payload: 'x', kind: 'invite', origin: ORIGIN });
		const reply = buildLink({ payload: 'x', kind: 'reply', origin: ORIGIN });

		expect(invite).not.toBe(reply);
		expect(readLink(new URL(invite).hash)?.kind).toBe('invite');
		expect(readLink(new URL(reply).hash)?.kind).toBe('reply');
	});

	it('refuses to build a link around nothing', () => {
		expect(() => buildLink({ payload: '', kind: 'invite', origin: ORIGIN })).toThrow();
	});
});

describe('readLink', () => {
	it('survives a round trip, including characters that need escaping', () => {
		// Real payloads are compressed and base64-ish, but nothing guarantees the
		// alphabet. A '+' or '&' reaching the fragment unescaped would truncate it
		// into a shorter string that still parses — a corrupted handshake that
		// looks valid is worse than one that fails.
		const payload = 'a+b&c=d#e/f?g h%i';
		const link = buildLink({ payload, kind: 'invite', origin: ORIGIN });

		expect(readLink(new URL(link).hash)?.payload).toBe(payload);
	});

	it('reads a fragment with or without the leading hash', () => {
		expect(readLink('#i=abc')?.payload).toBe('abc');
		expect(readLink('i=abc')?.payload).toBe('abc');
	});

	it('still finds the payload when a messenger appends its own parameters', () => {
		expect(readLink('#i=abc&utm_source=whatsapp')?.payload).toBe('abc');
	});

	it('returns null for anything that is not one of ours', () => {
		expect(readLink('')).toBeNull();
		expect(readLink('#')).toBeNull();
		expect(readLink('#section-two')).toBeNull();
		expect(readLink('#i=')).toBeNull();
	});
});

describe('the QR budget', () => {
	it('still holds once the payload is wrapped in a link', () => {
		// A production offer measured about 1100 characters with STUN candidates.
		// The QR now carries the link, so the wrapper has to be paid for out of
		// the same budget — this is the assertion that fails first if the origin
		// ever gets much longer, rather than a camera failing in a studio.
		const payload = 'x'.repeat(1100);
		const link = buildLink({ payload, kind: 'invite', origin: ORIGIN });

		expect(link.length).toBeLessThan(QR_CHARACTER_BUDGET);
	});

	it('costs only a small, bounded wrapper for an unescaped payload', () => {
		const payload = 'abcdefghijklmnopqrstuvwxyz0123456789-_';

		expect(linkOverhead({ payload, kind: 'invite', origin: ORIGIN })).toBeLessThan(50);
	});
});
