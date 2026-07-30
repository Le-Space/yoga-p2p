import { describe, expect, it } from 'vitest';

import { cashReport, cashTotal, findOverdrafts } from './reconcile.js';
import type { LedgerState, TicketState } from '../ledger/types.js';

type TicketInput = {
	ticketId?: string;
	unitsTotal?: number | null;
	unitsRemaining?: number | null;
	amountEUR?: number;
	method?: string;
	soldAt?: { locationId: string; deviceDid: string };
	redeemedAt?: { locationId: string; deviceDid: string }[];
	forkedAt?: { locationId: string; deviceDid: string }[];
};

function ledger(did: string, tickets: TicketInput[]): { did: string; state: LedgerState } {
	const state: LedgerState = {
		tickets: new Map(),
		forks: [],
		rejected: [],
		lastEventAt: null
	};

	tickets.forEach((input, index) => {
		const ticketId = input.ticketId ?? `ticket:${index}`;
		state.tickets.set(ticketId, {
			ticketId,
			unitsTotal: input.unitsTotal ?? 10,
			unitsRemaining: input.unitsRemaining ?? 10,
			// Always present: a ticket exists because somebody issued it, and leaving
			// the issue off meant the overdraft tests priced everything at zero — the
			// fixture was wrong, not the rule.
			issue: {
				payment: { method: input.method ?? 'cash', amountEUR: input.amountEUR ?? 120 },
				issuedBy: input.soldAt ?? { locationId: '', deviceDid: '' }
			},
			redeems: (input.redeemedAt ?? []).map((redeemedBy) => ({ event: { redeemedBy } })),
			forks: input.forkedAt
				? [{ seq: 1, events: input.forkedAt.map((redeemedBy) => ({ redeemedBy })) }]
				: []
		} as unknown as TicketState);
	});

	return { did, state };
}

const altstadtTill = { locationId: 'location:altstadt', deviceDid: 'did:key:alice' };
const westTill = { locationId: 'location:west', deviceDid: 'did:key:carol' };

describe('cashReport', () => {
	it('groups by location and device together', () => {
		// Both, because "what came in at the old town desk" and "who was on the till"
		// are different questions, and the second one gets asked when the cash box
		// does not match.
		const rows = cashReport([
			ledger('did:key:bob', [{ soldAt: altstadtTill, amountEUR: 120 }]),
			ledger('did:key:dora', [{ soldAt: westTill, amountEUR: 90 }])
		]);

		expect(rows).toHaveLength(2);
		expect(rows[0]).toMatchObject({ locationId: 'location:altstadt', sales: 1, cashEUR: 120 });
		expect(rows[1]).toMatchObject({ locationId: 'location:west', sales: 1, cashEUR: 90 });
	});

	it('adds up several sales from the same till', () => {
		const rows = cashReport([
			ledger('did:key:bob', [
				{ soldAt: altstadtTill, amountEUR: 120 },
				{ soldAt: altstadtTill, amountEUR: 30 }
			])
		]);

		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ sales: 2, cashEUR: 150 });
	});

	it('counts a transfer as a sale but not as cash', () => {
		// No money changed hands: a transfer moves an existing balance to a new DID.
		// Counting it would double the original sale in every report from then on.
		const rows = cashReport([
			ledger('did:key:bob', [{ soldAt: altstadtTill, amountEUR: 0, method: 'transfer' }])
		]);

		expect(rows[0]).toMatchObject({ sales: 1, cashEUR: 0 });
	});

	it('counts redemptions where they happened, not where the pass was sold', () => {
		const rows = cashReport([
			ledger('did:key:bob', [{ soldAt: altstadtTill, redeemedAt: [westTill, westTill] }])
		]);

		const west = rows.find((row) => row.locationId === 'location:west');
		expect(west).toMatchObject({ sales: 0, cashEUR: 0, redemptions: 2 });
	});

	it('counts a forked check-in as disputed rather than losing it', () => {
		// Neither side of a contradiction is accepted, but somebody taught both
		// classes. A report saying "0 check-ins" after two people walked in is the
		// kind of true-but-useless number this column exists to avoid.
		const rows = cashReport([
			ledger('did:key:bob', [{ soldAt: altstadtTill, forkedAt: [altstadtTill, westTill] }])
		]);

		expect(rows.find((row) => row.locationId === 'location:altstadt')).toMatchObject({
			redemptions: 0,
			disputed: 1
		});
		expect(rows.find((row) => row.locationId === 'location:west')).toMatchObject({
			redemptions: 0,
			disputed: 1
		});
	});

	it('adds up to the same total as its rows', () => {
		const rows = cashReport([
			ledger('did:key:bob', [{ soldAt: altstadtTill, amountEUR: 120 }]),
			ledger('did:key:dora', [{ soldAt: westTill, amountEUR: 89.9 }])
		]);

		expect(cashTotal(rows)).toBe(209.9);
	});
});

describe('findOverdrafts', () => {
	it('prices classes attended beyond the pass at what the student paid', () => {
		// Ten classes for 120 is twelve each; two over is 24. Today's price list does
		// not come into it — that would be inventing a debt.
		const overdrafts = findOverdrafts([
			ledger('did:key:bob', [
				{ ticketId: 'ticket:x', unitsTotal: 10, unitsRemaining: -2, amountEUR: 120 }
			])
		]);

		expect(overdrafts).toEqual([
			{ studentDid: 'did:key:bob', ticketId: 'ticket:x', unitsOver: 2, rechargeEUR: 24 }
		]);
	});

	it('says nothing about a pass that is merely used up', () => {
		expect(
			findOverdrafts([ledger('did:key:bob', [{ unitsTotal: 10, unitsRemaining: 0 }])])
		).toHaveLength(0);
	});

	it('ignores a time pass, which cannot be overdrawn', () => {
		expect(
			findOverdrafts([ledger('did:key:bob', [{ unitsTotal: null, unitsRemaining: null }])])
		).toHaveLength(0);
	});

	it('rounds to cents once, at the end', () => {
		// 100 / 3 is 33.333…; three classes over must come to 100.00, not 99.99.
		const overdrafts = findOverdrafts([
			ledger('did:key:bob', [{ unitsTotal: 3, unitsRemaining: -3, amountEUR: 100 }])
		]);

		expect(overdrafts[0].rechargeEUR).toBe(100);
	});

	it('reports every student separately', () => {
		const overdrafts = findOverdrafts([
			ledger('did:key:bob', [{ unitsTotal: 10, unitsRemaining: -1, amountEUR: 120 }]),
			ledger('did:key:dora', [{ unitsTotal: 10, unitsRemaining: -3, amountEUR: 120 }])
		]);

		expect(overdrafts.map((over) => over.rechargeEUR)).toEqual([12, 36]);
	});
});
