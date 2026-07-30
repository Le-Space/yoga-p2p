import { describe, expect, it } from 'vitest';

import { findConflicts } from './conflicts.js';
import type { LedgerState, TicketState } from '../ledger/types.js';

/** A folded ledger holding exactly the redemptions given, and nothing else. */
function ledgerWith(
	redeems: { courseId: string | null; date: string; deviceDid?: string }[]
): LedgerState {
	const ticket = {
		ticketId: 'ticket:1',
		redeems: redeems.map((redeem) => ({
			event: {
				_id: `redeem:${redeem.courseId}:${redeem.date}`,
				type: 'redeem',
				courseId: redeem.courseId,
				date: redeem.date,
				redeemedBy: { deviceDid: redeem.deviceDid ?? 'did:key:counter', locationId: 'location:a' }
			},
			unitsUsed: 1
		}))
	} as unknown as TicketState;

	return {
		tickets: new Map([['ticket:1', ticket]]),
		forks: [],
		rejected: [],
		lastEventAt: null
	};
}

const booking = (status: string, courseId = 'course:vinyasa', date = '2026-08-05') => ({
	_id: `booking:${status}:${date}`,
	status,
	courseId,
	date
});

describe('findConflicts', () => {
	it('reports a booking cancelled after the class was checked in', () => {
		const conflicts = findConflicts(
			[booking('cancelled')],
			ledgerWith([{ courseId: 'course:vinyasa', date: '2026-08-05' }])
		);

		expect(conflicts).toHaveLength(1);
		expect(conflicts[0].kind).toBe('cancelled-after-redeem');
		expect(conflicts[0].redeemedBy).toBe('did:key:counter');
	});

	it('leaves a cancellation alone when nobody checked in', () => {
		expect(findConflicts([booking('cancelled')], ledgerWith([]))).toHaveLength(0);
	});

	it('leaves a redeemed class alone when the booking still stands', () => {
		const ledger = ledgerWith([{ courseId: 'course:vinyasa', date: '2026-08-05' }]);

		expect(findConflicts([booking('confirmed')], ledger)).toHaveLength(0);
		expect(findConflicts([booking('requested')], ledger)).toHaveLength(0);
	});

	it('does not pair a cancellation with a different class or day', () => {
		const cancelled = [booking('cancelled', 'course:vinyasa', '2026-08-05')];

		expect(
			findConflicts(cancelled, ledgerWith([{ courseId: 'course:yin', date: '2026-08-05' }]))
		).toHaveLength(0);
		expect(
			findConflicts(cancelled, ledgerWith([{ courseId: 'course:vinyasa', date: '2026-08-12' }]))
		).toHaveLength(0);
	});

	it('ignores a redemption with no course, which cannot contradict a booking', () => {
		// Time passes redeem without naming a course. Treating that as attendance of
		// whatever was booked that day would invent a contradiction from thin air.
		expect(
			findConflicts([booking('cancelled')], ledgerWith([{ courseId: null, date: '2026-08-05' }]))
		).toHaveLength(0);
	});

	it('reports each cancelled booking separately', () => {
		const conflicts = findConflicts(
			[
				booking('cancelled', 'course:vinyasa', '2026-08-05'),
				booking('cancelled', 'course:yin', '2026-08-06')
			],
			ledgerWith([
				{ courseId: 'course:vinyasa', date: '2026-08-05' },
				{ courseId: 'course:yin', date: '2026-08-06' }
			])
		);

		expect(conflicts.map((conflict) => conflict.courseId)).toEqual([
			'course:vinyasa',
			'course:yin'
		]);
	});
});
