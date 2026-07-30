// Contradictions between two records that were each written in good faith.
//
// Nothing here is a bug being caught. Two devices that could not see each other
// both did something reasonable, and the results disagree — a student cancelled a
// class from the tram while the counter was checking them in for it. With no
// server there is no ordering that makes one of them wrong, and picking a winner
// automatically would silently destroy one of two legitimate facts.
//
// So this module only *states* them. The screens show both sides; a person
// decides. That is the same stance as the fork alarm (docs/LIMITS.md §1.1):
// detection, not prevention, and never a quiet repair.
//
// Pure by design — no stores, no database, no browser — so the rules can be unit
// tested without staging two browsers.

/**
 * @typedef {object} Conflict
 * @property {'cancelled-after-redeem'} kind
 * @property {string} bookingId
 * @property {string} courseId
 * @property {string} date
 * @property {string} redeemedBy the device that wrote the redemption
 */

/**
 * Bookings that were cancelled although the class had already been attended.
 *
 * Only *accepted* redemptions count. A redemption the ledger itself refused —
 * outside the validity window, from a revoked device — is not a fact about
 * attendance, and pairing it with a cancellation would invent a contradiction out
 * of two non-events.
 *
 * @param {any[]} bookings the student's bookings
 * @param {import('../ledger/index.js').LedgerState} ledger the same student's folded ledger
 * @returns {Conflict[]}
 */
export function findConflicts(bookings, ledger) {
	/** @type {Map<string, any>} */
	const attended = new Map();

	for (const ticket of ledger.tickets.values()) {
		for (const accepted of ticket.redeems) {
			// Course and date together are what a booking refers to; a redemption
			// without a course cannot contradict one.
			if (!accepted.event.courseId) continue;
			attended.set(`${accepted.event.courseId}|${accepted.event.date}`, accepted.event);
		}
	}

	/** @type {Conflict[]} */
	const conflicts = [];

	for (const booking of bookings) {
		if (booking.status !== 'cancelled') continue;

		const redeem = attended.get(`${booking.courseId}|${booking.date}`);
		if (!redeem) continue;

		conflicts.push({
			kind: 'cancelled-after-redeem',
			bookingId: booking._id,
			courseId: booking.courseId,
			date: booking.date,
			redeemedBy: redeem.redeemedBy?.deviceDid ?? ''
		});
	}

	return conflicts;
}
