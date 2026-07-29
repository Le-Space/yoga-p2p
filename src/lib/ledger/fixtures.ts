// Builders for ledger unit tests. Test-only, but kept next to the module it
// exercises so a schema change breaks the builders in the same commit.

import { redeemHash } from './canonical.js';
import type {
	DeviceRecord,
	IssueEvent,
	IsoDate,
	LedgerContext,
	LedgerEvent,
	RedeemEvent,
	VoidEvent
} from './types.js';

export const ALICE_DEVICE = 'did:key:z6MkAliceFrontDeskAltstadt';
export const CAROL_DEVICE = 'did:key:z6MkCarolFrontDeskWest';
export const ROGUE_DEVICE = 'did:key:z6MkRogueUnregistered';
export const STUDENT = 'did:key:z6MkBobStudent';

export const ALTSTADT = 'location:altstadt';
export const WEST = 'location:west';

export function deviceRegistry(
	overrides: Partial<Record<string, Partial<DeviceRecord>>> = {}
): Map<string, DeviceRecord> {
	const base: DeviceRecord[] = [
		{
			deviceDid: ALICE_DEVICE,
			role: 'owner',
			locationId: ALTSTADT,
			grantedAt: '2026-01-01T00:00:00.000Z',
			revokedAt: null
		},
		{
			deviceDid: CAROL_DEVICE,
			role: 'front-desk',
			locationId: WEST,
			grantedAt: '2026-01-01T00:00:00.000Z',
			revokedAt: null
		}
	];

	return new Map(
		base.map((device) => [device.deviceDid, { ...device, ...overrides[device.deviceDid] }])
	);
}

/** Signature stub that accepts everything — named so tests never look verified by accident. */
export const acceptAllSignatures = () => true;

/** Signature stub that refuses the listed event ids. */
export function refuseSignatures(...ids: string[]) {
	const refused = new Set(ids);
	return (event: LedgerEvent) => !refused.has(event._id);
}

export function context(overrides: Partial<LedgerContext> = {}): LedgerContext {
	return {
		devices: deviceRegistry(),
		isSignatureValid: acceptAllSignatures,
		today: '2026-09-01',
		...overrides
	};
}

export function issue(overrides: Partial<IssueEvent> = {}): IssueEvent {
	return {
		_id: 'ticket:t1',
		type: 'issue',
		studentDid: STUDENT,
		packageId: 'package:10er',
		courseId: null,
		unitsTotal: 10,
		payment: { method: 'cash', amountEUR: 120, receivedAt: '2026-08-01T09:00:00.000Z' },
		issuedBy: { deviceDid: ALICE_DEVICE, locationId: ALTSTADT },
		validFrom: '2026-08-01',
		validUntil: '2027-01-28',
		validityStart: 'issue',
		sig: 'sig-issue',
		...overrides
	};
}

export function voided(overrides: Partial<VoidEvent> = {}): VoidEvent {
	return {
		_id: 'void:v1',
		type: 'void',
		ticketId: 'ticket:t1',
		reason: 'refund',
		voidedBy: { deviceDid: ALICE_DEVICE, locationId: ALTSTADT },
		voidedAt: '2026-08-20T10:00:00.000Z',
		sig: 'sig-void',
		...overrides
	};
}

/**
 * Build a correctly linked chain of redemptions, one per given day.
 *
 * Chaining by hand in every test would make the tests about hashing rather
 * than about the rule under test.
 */
export function redeemChain(
	dates: IsoDate[],
	overrides: Partial<RedeemEvent> = {},
	perEvent: (index: number) => Partial<RedeemEvent> = () => ({})
): RedeemEvent[] {
	const chain: RedeemEvent[] = [];
	let prevRedeemHash: string | null = null;

	dates.forEach((date, index) => {
		const event: RedeemEvent = {
			_id: `redeem:r${index + 1}`,
			type: 'redeem',
			ticketId: 'ticket:t1',
			seq: index + 1,
			prevRedeemHash,
			courseId: 'course:vinyasa-mi-18',
			date,
			redeemedBy: { deviceDid: ALICE_DEVICE, locationId: ALTSTADT },
			redeemedAt: `${date}T18:00:00.000Z`,
			sig: `sig-r${index + 1}`,
			...overrides,
			...perEvent(index)
		};

		chain.push(event);
		prevRedeemHash = redeemHash(event);
	});

	return chain;
}

/** Deterministic shuffles of an array — used for the order-invariance tests. */
export function shuffles<T>(items: T[], count = 12): T[][] {
	const results: T[][] = [];
	// A small LCG keeps the permutations reproducible across runs and machines.
	let seed = 42;
	const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648);

	for (let run = 0; run < count; run++) {
		const copy = [...items];
		for (let i = copy.length - 1; i > 0; i--) {
			const j = next() % (i + 1);
			[copy[i], copy[j]] = [copy[j], copy[i]];
		}
		results.push(copy);
	}

	return results;
}
