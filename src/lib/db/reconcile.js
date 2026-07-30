// The cash report, and the overdrafts it has to own up to (T5.3).
//
// A studio with two counters and no server will sometimes sell more classes than
// a pass had left — two people redeeming the same position while out of touch is
// not a bug, it is the trade this whole design makes (docs/LIMITS.md §1.1). What
// the design owes in return is that the shortfall is **found and priced**, not
// buried in a balance that quietly stops at zero.
//
// So `unitsRemaining` is deliberately not clamped in the reducer, and this module
// reads the negative number for what it is: classes that were attended and never
// paid for. It says how much, per student, so somebody can ask for it.
//
// Pure — takes folded ledgers, returns numbers. No stores, no database, no
// browser, so every rule here is unit tested rather than staged through two
// counters.

/**
 * @typedef {object} CashRow
 * @property {string} locationId
 * @property {string} deviceDid
 * @property {number} sales how many passes were sold
 * @property {number} cashEUR what was taken in cash
 * @property {number} redemptions classes checked in here and accepted
 * @property {number} disputed check-ins that collided with another counter's
 */

/**
 * @typedef {object} Overdraft
 * @property {string} studentDid
 * @property {string} ticketId
 * @property {number} unitsOver classes attended beyond what was paid for
 * @property {number} rechargeEUR what that comes to, at the price actually paid
 */

/**
 * Group takings by location and device.
 *
 * Both, not either: a location answers "what came in at the front desk in the old
 * town", and a device answers "who was on the till" — and the second question is
 * the one that gets asked when the cash box does not match.
 *
 * Cash only. A transfer moves an existing balance to a new DID and no money
 * changes hands, so counting it would double every original sale from that day on.
 *
 * @param {{ did: string, state: import('../ledger/index.js').LedgerState }[]} ledgers
 * @returns {CashRow[]}
 */
export function cashReport(ledgers) {
	/** @type {Map<string, CashRow>} */
	const rows = new Map();

	/** @param {string} locationId @param {string} deviceDid */
	const rowFor = (locationId, deviceDid) => {
		const key = `${locationId}|${deviceDid}`;
		if (!rows.has(key)) {
			rows.set(key, { locationId, deviceDid, sales: 0, cashEUR: 0, redemptions: 0, disputed: 0 });
		}
		return /** @type {CashRow} */ (rows.get(key));
	};

	for (const { state } of ledgers) {
		for (const ticket of state.tickets.values()) {
			if (ticket.issue) {
				const { locationId = '', deviceDid = '' } = ticket.issue.issuedBy ?? {};
				const row = rowFor(locationId, deviceDid);
				row.sales += 1;
				if (ticket.issue.payment?.method === 'cash') {
					row.cashEUR += Number(ticket.issue.payment.amountEUR) || 0;
				}
			}

			// Only accepted redemptions. A refused one is not attendance, and counting
			// it here would make the busiest counter look like the one with the most
			// broken passes.
			for (const accepted of ticket.redeems) {
				const { locationId = '', deviceDid = '' } = accepted.event.redeemedBy ?? {};
				rowFor(locationId, deviceDid).redemptions += 1;
			}

			// Forked ones are counted separately rather than dropped, and that column
			// exists because a test asked the obvious question: two people walked into
			// two studios on one pass, and the report said "0 check-ins". Neither event
			// is accepted — the reducer refuses both sides of a contradiction — but
			// somebody did teach those classes, and the desk needs to see it.
			for (const fork of ticket.forks) {
				for (const event of fork.events) {
					const { locationId = '', deviceDid = '' } = event.redeemedBy ?? {};
					rowFor(locationId, deviceDid).disputed += 1;
				}
			}
		}
	}

	return [...rows.values()].sort((a, b) =>
		`${a.locationId}${a.deviceDid}` < `${b.locationId}${b.deviceDid}` ? -1 : 1
	);
}

/**
 * Classes attended beyond what a pass covered.
 *
 * Priced at what the student actually paid — `amountEUR / unitsTotal` off their own
 * `issue` event, not off today's price list. A pass bought in the summer sale is
 * recharged at the summer price; anything else would be inventing a debt.
 *
 * @param {{ did: string, state: import('../ledger/index.js').LedgerState }[]} ledgers
 * @returns {Overdraft[]}
 */
export function findOverdrafts(ledgers) {
	/** @type {Overdraft[]} */
	const overdrafts = [];

	for (const { did, state } of ledgers) {
		for (const ticket of state.tickets.values()) {
			// A pass without unit accounting — a time pass — cannot be overdrawn.
			if (ticket.unitsRemaining === null || ticket.unitsRemaining >= 0) continue;

			const unitsOver = -ticket.unitsRemaining;
			const paid = Number(ticket.issue?.payment?.amountEUR) || 0;
			const total = Number(ticket.unitsTotal) || 0;
			const unitPrice = total > 0 ? paid / total : 0;

			overdrafts.push({
				studentDid: did,
				ticketId: ticket.ticketId,
				unitsOver,
				// Rounded to cents at the end rather than per unit, so five classes at
				// 11.999… do not quietly become five short cents.
				rechargeEUR: Math.round(unitsOver * unitPrice * 100) / 100
			});
		}
	}

	return overdrafts;
}

/**
 * What the whole report adds up to.
 *
 * @param {CashRow[]} rows
 */
export function cashTotal(rows) {
	return Math.round(rows.reduce((sum, row) => sum + row.cashEUR, 0) * 100) / 100;
}
