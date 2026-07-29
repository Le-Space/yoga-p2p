import { describe, expect, it } from 'vitest';

import { canRedeem, nextChainPosition, reduceLedger, reduceTicket } from './reduce.js';
import { redeemHash } from './canonical.js';
import {
	ALICE_DEVICE,
	ALTSTADT,
	CAROL_DEVICE,
	ROGUE_DEVICE,
	WEST,
	context,
	deviceRegistry,
	issue,
	redeemChain,
	refuseSignatures,
	shuffles,
	voided
} from './fixtures.js';
import type { RedeemEvent, RejectionReason } from './types.js';

const reasons = (state: { rejected: { reason: RejectionReason }[] }) =>
	state.rejected.map((r) => r.reason);

describe('balance', () => {
	it('counts a ten-class pass down as it is used', () => {
		const events = [issue(), ...redeemChain(['2026-08-05', '2026-08-12', '2026-08-19'])];
		const state = reduceTicket('ticket:t1', events, context());

		expect(state.unitsRemaining).toBe(7);
		expect(state.unitsUsed).toBe(3);
		expect(state.status).toBe('active');
		expect(state.rejected).toEqual([]);
	});

	it('marks a pass exhausted once every unit is spent', () => {
		const dates = Array.from({ length: 3 }, (_, i) => `2026-08-0${i + 1}`);
		const state = reduceTicket(
			'ticket:t1',
			[issue({ unitsTotal: 3 }), ...redeemChain(dates)],
			context()
		);

		expect(state.unitsRemaining).toBe(0);
		expect(state.status).toBe('exhausted');
	});

	it('refuses a redemption once the units are gone', () => {
		const dates = ['2026-08-01', '2026-08-02', '2026-08-03'];
		const state = reduceTicket(
			'ticket:t1',
			[issue({ unitsTotal: 2 }), ...redeemChain(dates)],
			context()
		);

		expect(state.unitsUsed).toBe(2);
		expect(reasons(state)).toEqual(['no-units-left']);
	});

	it('logs attendance without deducting on a time pass', () => {
		const state = reduceTicket(
			'ticket:t1',
			[
				issue({ unitsTotal: null, packageId: 'package:month' }),
				...redeemChain(['2026-08-05', '2026-08-06', '2026-08-07'])
			],
			context()
		);

		expect(state.unitsRemaining).toBeNull();
		expect(state.redeems).toHaveLength(3);
		expect(state.status).toBe('active');
	});

	it('reports a ticket whose issue event has not replicated yet', () => {
		const state = reduceTicket('ticket:t1', redeemChain(['2026-08-05']), context());

		expect(state.status).toBe('unknown');
		expect(reasons(state)).toEqual(['no-issue']);
	});
});

describe('order invariance', () => {
	const events = [
		issue(),
		...redeemChain(['2026-08-05', '2026-08-12', '2026-08-19', '2026-08-26'])
	];
	const expected = reduceTicket('ticket:t1', events, context());

	it('produces the same fold for every input order', () => {
		for (const shuffled of shuffles(events)) {
			const state = reduceTicket('ticket:t1', shuffled, context());

			expect(state.unitsRemaining).toBe(expected.unitsRemaining);
			expect(state.status).toBe(expected.status);
			expect(state.redeems.map((r) => r.event._id)).toEqual(
				expected.redeems.map((r) => r.event._id)
			);
			expect(reasons(state)).toEqual(reasons(expected));
		}
	});

	it('reaches the same balance no matter which device wrote which redemption', () => {
		// Same three visits, but written at two locations in different splits.
		const atAltstadt = redeemChain(['2026-08-05', '2026-08-12', '2026-08-19']);
		const atWest = redeemChain(['2026-08-05', '2026-08-12', '2026-08-19'], {}, (index) =>
			index === 1 ? { redeemedBy: { deviceDid: CAROL_DEVICE, locationId: WEST } } : {}
		);

		const a = reduceTicket('ticket:t1', [issue(), ...atAltstadt], context());
		const b = reduceTicket('ticket:t1', [issue(), ...atWest], context());

		expect(a.unitsRemaining).toBe(b.unitsRemaining);
		expect(a.status).toBe(b.status);
	});

	it('ignores a redemption that replicated twice over two connections', () => {
		const chain = redeemChain(['2026-08-05', '2026-08-12']);
		const state = reduceTicket('ticket:t1', [issue(), ...chain, ...chain], context());

		expect(state.unitsRemaining).toBe(8);
		expect(state.rejected).toEqual([]);
	});
});

describe('fork detection', () => {
	it('flags two signed redemptions claiming the same chain position', () => {
		const [first] = redeemChain(['2026-08-05']);
		const rollback: RedeemEvent = {
			...first,
			_id: 'redeem:rollback',
			date: '2026-08-06',
			redeemedAt: '2026-08-06T18:00:00.000Z',
			redeemedBy: { deviceDid: CAROL_DEVICE, locationId: WEST },
			sig: 'sig-rollback'
		};

		const state = reduceTicket('ticket:t1', [issue(), first, rollback], context());

		expect(state.forks).toHaveLength(1);
		expect(state.forks[0].seq).toBe(1);
		// Both signed events are kept verbatim — they are the proof.
		expect(state.forks[0].events.map((e) => e.sig).sort()).toEqual(['sig-r1', 'sig-rollback']);
	});

	it('charges a fork exactly one unit, never zero', () => {
		const [first] = redeemChain(['2026-08-05']);
		const rollback: RedeemEvent = { ...first, _id: 'redeem:rollback', sig: 'sig-rollback' };
		const state = reduceTicket('ticket:t1', [issue(), first, rollback], context());

		expect(state.unitsUsed).toBe(1);
		expect(state.unitsRemaining).toBe(9);
	});

	it('counts a chain position that has not replicated as used', () => {
		const chain = redeemChain(['2026-08-05', '2026-08-12', '2026-08-19']);
		const withoutSecond = [chain[0], chain[2]];

		const state = reduceTicket('ticket:t1', [issue(), ...withoutSecond], context());

		expect(state.missingSeqs).toEqual([2]);
		expect(state.unitsUsed).toBe(3);
		expect(state.unitsRemaining).toBe(7);
	});

	it('refuses a redemption whose back-link points nowhere', () => {
		const chain = redeemChain(['2026-08-05', '2026-08-12']);
		const tampered = { ...chain[1], prevRedeemHash: 'deadbeef' };

		const state = reduceTicket('ticket:t1', [issue(), chain[0], tampered], context());

		expect(reasons(state)).toEqual(['chain-break']);
		expect(state.unitsRemaining).toBe(9);
	});
});

describe('registry and signatures', () => {
	it('refuses an event from a device that was never registered', () => {
		const chain = redeemChain(['2026-08-05'], {
			redeemedBy: { deviceDid: ROGUE_DEVICE, locationId: WEST }
		});

		const state = reduceTicket('ticket:t1', [issue(), ...chain], context());

		expect(reasons(state)).toEqual(['unknown-device']);
		expect(state.unitsRemaining).toBe(10);
	});

	it('keeps what a device signed before its revocation and refuses what came after', () => {
		const ctx = context({
			devices: deviceRegistry({ [CAROL_DEVICE]: { revokedAt: '2026-08-10T00:00:00.000Z' } })
		});
		const chain = redeemChain(['2026-08-05', '2026-08-12'], {
			redeemedBy: { deviceDid: CAROL_DEVICE, locationId: WEST }
		});

		const state = reduceTicket('ticket:t1', [issue(), ...chain], ctx);

		expect(state.redeems.map((r) => r.event.date)).toEqual(['2026-08-05']);
		expect(reasons(state)).toEqual(['revoked-device']);
	});

	it('refuses an event whose signature does not verify', () => {
		const ctx = context({ isSignatureValid: refuseSignatures('redeem:r1') });
		const state = reduceTicket('ticket:t1', [issue(), ...redeemChain(['2026-08-05'])], ctx);

		expect(reasons(state)).toEqual(['bad-signature']);
		expect(state.unitsRemaining).toBe(10);
	});
});

describe('validity', () => {
	const cases: {
		name: string;
		date: string;
		courseId?: string;
		expected: RejectionReason | 'accepted';
	}[] = [
		{ name: 'before the window opens', date: '2026-07-31', expected: 'outside-validity' },
		{ name: 'on the first valid day', date: '2026-08-01', expected: 'accepted' },
		{ name: 'inside the window', date: '2026-10-01', expected: 'accepted' },
		{ name: 'on the last valid day', date: '2027-01-28', expected: 'accepted' },
		{ name: 'after the window closes', date: '2027-01-29', expected: 'outside-validity' }
	];

	for (const testCase of cases) {
		it(`${testCase.expected === 'accepted' ? 'accepts' : 'refuses'} a redemption ${testCase.name}`, () => {
			const state = reduceTicket(
				'ticket:t1',
				[issue(), ...redeemChain([testCase.date])],
				context()
			);

			if (testCase.expected === 'accepted') {
				expect(state.redeems).toHaveLength(1);
				expect(state.rejected).toEqual([]);
			} else {
				expect(reasons(state)).toEqual([testCase.expected]);
			}
		});
	}

	it('refuses a series ticket used for a different course', () => {
		const seriesTicket = issue({
			packageId: null,
			courseId: 'course:anfaenger-h26',
			unitsTotal: null
		});
		const state = reduceTicket(
			'ticket:t1',
			[seriesTicket, ...redeemChain(['2026-09-08'], { courseId: 'course:vinyasa-mi-18' })],
			context()
		);

		expect(reasons(state)).toEqual(['wrong-course']);
	});

	it('logs a series ticket visit without deducting anything', () => {
		const seriesTicket = issue({
			packageId: null,
			courseId: 'course:anfaenger-h26',
			unitsTotal: null,
			validFrom: '2026-09-08',
			validUntil: '2026-10-06'
		});
		const state = reduceTicket(
			'ticket:t1',
			[
				seriesTicket,
				...redeemChain(['2026-09-08', '2026-09-10'], { courseId: 'course:anfaenger-h26' })
			],
			context()
		);

		expect(state.redeems).toHaveLength(2);
		expect(state.unitsRemaining).toBeNull();
	});

	describe('validityStart: firstRedeem', () => {
		const card = () =>
			issue({
				validityStart: 'firstRedeem',
				validUntil: null,
				validityDays: 30,
				unitsTotal: 5
			});

		it('stays dormant until the first redemption', () => {
			const state = reduceTicket('ticket:t1', [card()], context());

			expect(state.status).toBe('dormant');
			expect(state.validUntil).toBeNull();
		});

		it('starts its window with the first redemption', () => {
			const state = reduceTicket(
				'ticket:t1',
				[card(), ...redeemChain(['2026-09-10'])],
				context({ today: '2026-09-10' })
			);

			expect(state.validFrom).toBe('2026-09-10');
			expect(state.validUntil).toBe('2026-10-09'); // 30 days, inclusive
			expect(state.status).toBe('active');
		});

		it('refuses a redemption past the window it started itself', () => {
			const state = reduceTicket(
				'ticket:t1',
				[card(), ...redeemChain(['2026-09-10', '2026-10-10'])],
				context({ today: '2026-10-10' })
			);

			expect(state.redeems).toHaveLength(1);
			expect(reasons(state)).toEqual(['outside-validity']);
		});

		it('refuses a first redemption dated before the sale', () => {
			const state = reduceTicket('ticket:t1', [card(), ...redeemChain(['2026-07-15'])], context());

			expect(reasons(state)).toEqual(['outside-validity']);
		});
	});

	it('reports an expired ticket as expired', () => {
		const state = reduceTicket('ticket:t1', [issue()], context({ today: '2027-02-01' }));

		expect(state.status).toBe('expired');
	});
});

describe('void and transfer', () => {
	it('voids a refunded ticket', () => {
		const state = reduceTicket('ticket:t1', [issue(), voided()], context());

		expect(state.status).toBe('voided');
		expect(state.voidedBy?.reason).toBe('refund');
	});

	it('refuses a redemption written after the ticket was voided', () => {
		const state = reduceTicket(
			'ticket:t1',
			[issue(), voided(), ...redeemChain(['2026-08-25'])],
			context()
		);

		expect(reasons(state)).toEqual(['voided']);
	});

	it('keeps redemptions that happened before the void', () => {
		const state = reduceTicket(
			'ticket:t1',
			[issue(), voided(), ...redeemChain(['2026-08-05'])],
			context()
		);

		expect(state.redeems).toHaveLength(1);
		expect(state.status).toBe('voided');
	});

	it('carries a balance to a new DID as a transfer ticket', () => {
		const events = [
			issue(),
			...redeemChain(['2026-08-05', '2026-08-12']),
			voided({ reason: 'transfer', transferTicketId: 'ticket:t2' }),
			issue({
				_id: 'ticket:t2',
				studentDid: 'did:key:z6MkBobNewDevice',
				unitsTotal: 8,
				payment: {
					method: 'transfer',
					amountEUR: 0,
					receivedAt: '2026-08-20T10:05:00.000Z',
					fromTicketId: 'ticket:t1'
				}
			})
		];

		const ledger = reduceLedger(events, context());

		expect(ledger.tickets.get('ticket:t1')?.status).toBe('voided');
		expect(ledger.tickets.get('ticket:t2')?.unitsRemaining).toBe(8);
	});
});

describe('check-in pre-flight', () => {
	it('agrees with the fold about a redemption it would accept', () => {
		const state = reduceTicket('ticket:t1', [issue()], context());

		expect(canRedeem(state, { courseId: 'course:vinyasa-mi-18', date: '2026-09-01' })).toEqual({
			ok: true
		});
	});

	it('refuses ahead of time what the fold would refuse afterwards', () => {
		const state = reduceTicket(
			'ticket:t1',
			[issue({ courseId: 'course:anfaenger-h26', unitsTotal: null })],
			context()
		);

		expect(canRedeem(state, { courseId: 'course:vinyasa-mi-18', date: '2026-09-01' })).toEqual({
			ok: false,
			reason: 'wrong-course'
		});
	});

	it('hands the next chain position to the counter', () => {
		const chain = redeemChain(['2026-08-05', '2026-08-12']);
		const state = reduceTicket('ticket:t1', [issue(), ...chain], context());

		expect(nextChainPosition(state)).toEqual({
			seq: 3,
			prevRedeemHash: redeemHash(chain[1])
		});
	});

	it('keeps the chain linked even when the last position forked', () => {
		const [first] = redeemChain(['2026-08-05']);
		const rollback: RedeemEvent = { ...first, _id: 'redeem:rollback', sig: 'sig-rollback' };
		const state = reduceTicket('ticket:t1', [issue(), first, rollback], context());
		const next = nextChainPosition(state);

		expect(next.seq).toBe(2);
		expect([redeemHash(first), redeemHash(rollback)]).toContain(next.prevRedeemHash);
	});
});

describe('whole ledger', () => {
	it('folds several tickets and surfaces every fork for the alarm screen', () => {
		const [first] = redeemChain(['2026-08-05']);
		const rollback: RedeemEvent = { ...first, _id: 'redeem:rollback', sig: 'sig-rollback' };

		const ledger = reduceLedger(
			[
				issue(),
				first,
				rollback,
				issue({ _id: 'ticket:t2', packageId: 'package:single', unitsTotal: 1 })
			],
			context()
		);

		expect([...ledger.tickets.keys()]).toEqual(['ticket:t1', 'ticket:t2']);
		expect(ledger.forks).toHaveLength(1);
		expect(ledger.tickets.get('ticket:t2')?.unitsRemaining).toBe(1);
	});

	it('reports the newest event as the "as of" timestamp', () => {
		const ledger = reduceLedger([issue(), ...redeemChain(['2026-08-05', '2026-08-12'])], context());

		expect(ledger.lastEventAt).toBe('2026-08-12T18:00:00.000Z');
	});

	it('routes events to the ticket they belong to regardless of input order', () => {
		const events = [
			issue(),
			issue({ _id: 'ticket:t2', unitsTotal: 5 }),
			...redeemChain(['2026-08-05']),
			...redeemChain(['2026-08-06'], { ticketId: 'ticket:t2', _id: 'redeem:t2r1' })
		];

		for (const shuffled of shuffles(events, 6)) {
			const ledger = reduceLedger(shuffled, context());

			expect(ledger.tickets.get('ticket:t1')?.unitsRemaining).toBe(9);
			expect(ledger.tickets.get('ticket:t2')?.unitsRemaining).toBe(4);
		}
	});
});

describe('cash reconciliation inputs', () => {
	it('keeps the issuing device and location on every sale', () => {
		const ledger = reduceLedger([issue()], context());
		const sale = ledger.tickets.get('ticket:t1')?.issue;

		expect(sale?.issuedBy).toEqual({ deviceDid: ALICE_DEVICE, locationId: ALTSTADT });
		expect(sale?.payment.amountEUR).toBe(120);
	});
});
