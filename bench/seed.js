// Deterministic data for the scenarios in docs/PLAN.md §11.
//
// No clicking through the UI: a thousand students over four years is not
// something a browser should be asked to produce, and a benchmark that seeds
// itself through the app measures the seeding rather than the thing under test.
//
// Deterministic on purpose. Every number this suite reports has to be comparable
// against the same numbers from last week, so the same seed must give byte-for-byte
// the same ledgers — no `Math.random`, no `Date.now`, no ordering that depends on a
// hash iteration.

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Mulberry32: small, fast, and stable across Node versions.
 *
 * The last part matters more than the first two — a generator whose output shifts
 * with the runtime would quietly invalidate every stored trend line.
 *
 * @param {number} seed
 */
export function rng(seed) {
	let state = seed >>> 0;
	return function next() {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** @param {string} start @param {number} days */
function addDays(start, days) {
	return new Date(Date.parse(`${start}T00:00:00.000Z`) + days * DAY_MS).toISOString();
}

/**
 * A studio's worth of ledgers.
 *
 * Shaped like the real thing rather than like a load test: a ten-class pass, then
 * redemptions against it, then the next pass when it runs out. That matters,
 * because the reducer's cost is driven by chain walking per ticket, and a flat pile
 * of unrelated events would be cheaper than reality rather than harder.
 *
 * @param {object} scenario
 * @param {number} scenario.students
 * @param {number} scenario.years
 * @param {number} [scenario.visitsPerYear] docs/PLAN.md §6.4 assumes ~60
 * @param {number} [scenario.locations]
 * @param {number} [scenario.seed]
 * @param {string} [scenario.from] first day of the first year
 * @returns {{ did: string, events: any[] }[]}
 */
export function seedLedgers({
	students,
	years,
	visitsPerYear = 60,
	locations = 2,
	seed = 1,
	from = '2022-01-03'
}) {
	const next = rng(seed);
	const ledgers = [];

	for (let s = 0; s < students; s++) {
		const did = `did:key:student${String(s).padStart(5, '0')}`;
		/** @type {any[]} */
		const events = [];

		let day = 0;
		let ticketIndex = 0;
		let unitsLeft = 0;
		let ticketId = '';
		let seq = 0;

		for (let visit = 0; visit < visitsPerYear * years; visit++) {
			// Visits land unevenly, the way a person actually turns up: mostly every
			// few days, occasionally after a gap.
			day += 1 + Math.floor(next() * 9);

			if (unitsLeft === 0) {
				ticketId = `ticket:${did}:${ticketIndex++}`;
				unitsLeft = 10;
				seq = 0;
				events.push({
					_id: ticketId,
					type: 'issue',
					studentDid: did,
					packageId: 'package:zehner',
					courseId: null,
					unitsTotal: 10,
					payment: { method: 'cash', amountEUR: 120, receivedAt: addDays(from, day) },
					issuedBy: {
						deviceDid: `did:key:device${Math.floor(next() * locations)}`,
						locationId: `location:${Math.floor(next() * locations)}`
					},
					validFrom: addDays(from, day).slice(0, 10),
					validUntil: addDays(from, day + 365).slice(0, 10),
					validityStart: 'issue',
					validityDays: 365,
					sig: `sig:${did}:${ticketIndex}`
				});
			}

			seq += 1;
			unitsLeft -= 1;
			events.push({
				_id: `redeem:${ticketId}:${seq}`,
				type: 'redeem',
				ticketId,
				seq,
				// A real chain: the reducer walks these, so leaving them null would
				// measure a cheaper shape than the app actually produces.
				prevRedeemHash: seq === 1 ? null : `hash:${ticketId}:${seq - 1}`,
				courseId: `course:${Math.floor(next() * 6)}`,
				date: addDays(from, day).slice(0, 10),
				redeemedBy: {
					deviceDid: `did:key:device${Math.floor(next() * locations)}`,
					locationId: `location:${Math.floor(next() * locations)}`
				},
				redeemedAt: addDays(from, day),
				sig: `sig:${ticketId}:${seq}`
			});
		}

		ledgers.push({ did, events });
	}

	return ledgers;
}

/**
 * The device registry those events were signed by.
 *
 * @param {number} locations
 */
export function seedDevices(locations = 2) {
	return new Map(
		Array.from({ length: locations }, (_, index) => [
			`did:key:device${index}`,
			{
				deviceDid: `did:key:device${index}`,
				role: index === 0 ? 'owner' : 'front-desk',
				locationId: `location:${index}`,
				grantedAt: '2021-12-01T00:00:00.000Z',
				revokedAt: null
			}
		])
	);
}

/**
 * What this would occupy as OrbitDB entries.
 *
 * JSON length is a floor, not the real thing — dag-cbor plus per-entry framing and
 * signatures add to it. Reported as a floor and labelled as one, because a number
 * that pretends to be exact is worse than a number that admits what it is.
 *
 * @param {{ events: any[] }[]} ledgers
 */
export function storageFloorBytes(ledgers) {
	let bytes = 0;
	for (const ledger of ledgers) {
		for (const event of ledger.events) bytes += JSON.stringify(event).length;
	}
	return bytes;
}
