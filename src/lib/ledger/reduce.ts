// The balance reducer: fold an append-only event log into ticket state.
//
// Pure and synchronous by design (docs/CLAUDE.md). No UI, no browser, no
// OrbitDB — the same function runs in the check-in screen and in a unit test.
//
// The two properties every change here must preserve:
//   1. Order invariance — shuffling the input never changes the output.
//   2. No credit from conflict — an ambiguous log can cost a student a unit,
//      but can never hand out a free one.

import { eventHash, redeemHash } from './canonical.js';
import type {
	AcceptedRedeem,
	Fork,
	IsoDate,
	IssueEvent,
	LedgerContext,
	LedgerEvent,
	LedgerState,
	RedeemEvent,
	Rejection,
	RejectionReason,
	TicketState,
	TicketStatus,
	VoidEvent
} from './types.js';

/** The timestamp an event claims for itself. */
function eventTime(event: LedgerEvent): string {
	if (event.type === 'issue') return event.payment.receivedAt;
	if (event.type === 'redeem') return event.redeemedAt;
	return event.voidedAt;
}

/** Which ticket an event belongs to. For an issue event, the ticket *is* the event. */
function ticketIdOf(event: LedgerEvent): string {
	return event.type === 'issue' ? event._id : event.ticketId;
}

/** Add whole days to a `YYYY-MM-DD` date, in UTC. */
export function addDays(date: IsoDate, days: number): IsoDate {
	const parsed = new Date(`${date}T00:00:00.000Z`);
	parsed.setUTCDate(parsed.getUTCDate() + days);
	return parsed.toISOString().slice(0, 10);
}

/**
 * Order two events deterministically: by their own timestamp, then by content
 * hash. Used everywhere a tie has to be broken so that every device folding
 * the same set reaches the same answer.
 */
function stableCompare(a: LedgerEvent, b: LedgerEvent): number {
	const ta = eventTime(a);
	const tb = eventTime(b);
	if (ta !== tb) return ta < tb ? -1 : 1;
	const ha = eventHash(a);
	const hb = eventHash(b);
	return ha < hb ? -1 : ha > hb ? 1 : 0;
}

/**
 * Registry and signature checks — the gate every event passes before it means
 * anything.
 *
 * A revoked device stays trustworthy for what it signed *before* the
 * revocation: revocation is not retroactive, otherwise a lost device would
 * erase a day of legitimately sold tickets. Anything it signs after
 * `revokedAt` is refused (docs/PLAN.md §6.3).
 */
function authorize(event: LedgerEvent, ctx: LedgerContext): RejectionReason | null {
	const author =
		event.type === 'issue'
			? event.issuedBy
			: event.type === 'redeem'
				? event.redeemedBy
				: event.voidedBy;

	const device = ctx.devices.get(author.deviceDid);
	if (!device) return 'unknown-device';
	if (device.revokedAt && eventTime(event) > device.revokedAt) return 'revoked-device';
	if (!ctx.isSignatureValid(event)) return 'bad-signature';
	return null;
}

/**
 * Drop replication duplicates and refuse id collisions.
 *
 * The same event arriving twice over two connections is normal and silent.
 * Two *different* events claiming one id is not: the one that sorts first is
 * kept so every device picks the same winner, the rest are rejected.
 */
function dedupe<T extends LedgerEvent>(events: T[], rejected: Rejection[]): T[] {
	const byId = new Map<string, T>();
	const seenHashes = new Set<string>();

	for (const event of [...events].sort(stableCompare)) {
		const hash = eventHash(event);
		if (seenHashes.has(hash)) continue; // byte-identical replica
		seenHashes.add(hash);

		const existing = byId.get(event._id);
		if (existing) {
			rejected.push({ event, reason: 'duplicate-id' });
			continue;
		}
		byId.set(event._id, event);
	}

	return [...byId.values()];
}

/** The effective validity window, which a `firstRedeem` ticket only gets once used. */
function validityWindow(
	issue: IssueEvent,
	firstRedeemDate: IsoDate | null
): { from: IsoDate; until: IsoDate | null } {
	if (issue.validityStart === 'issue') {
		return { from: issue.validFrom, until: issue.validUntil };
	}

	// firstRedeem: dormant until used, then a window of validityDays starting
	// on the day of the first redemption (inclusive of that day).
	if (!firstRedeemDate) return { from: issue.validFrom, until: null };

	const days = issue.validityDays;
	return {
		from: firstRedeemDate,
		until: typeof days === 'number' ? addDays(firstRedeemDate, days - 1) : issue.validUntil
	};
}

/**
 * Fold one ticket's events into its state.
 *
 * @param ticketId the ticket these events belong to
 * @param events every event mentioning that ticket, in any order
 */
export function reduceTicket(
	ticketId: string,
	events: LedgerEvent[],
	ctx: LedgerContext
): TicketState {
	const rejected: Rejection[] = [];
	const forks: Fork[] = [];

	// 1 — authorize, then deduplicate. Order of these two matters: an
	// unauthorized event must be reported as such, not as a duplicate.
	const authorized: LedgerEvent[] = [];
	for (const event of events) {
		const reason = authorize(event, ctx);
		if (reason) rejected.push({ event, reason });
		else authorized.push(event);
	}

	const issues = dedupe(
		authorized.filter((e): e is IssueEvent => e.type === 'issue'),
		rejected
	);
	const voids = dedupe(
		authorized.filter((e): e is VoidEvent => e.type === 'void'),
		rejected
	);
	const redeems = dedupe(
		authorized.filter((e): e is RedeemEvent => e.type === 'redeem'),
		rejected
	);

	const issue = issues.sort(stableCompare)[0] ?? null;
	const voidedBy = voids.sort(stableCompare)[0] ?? null;

	// 2 — group redeems by their claimed chain position. More than one distinct
	// event at a position is a fork: someone signed twice for the same slot,
	// which only happens if a ledger was rolled back (docs/PLAN.md §5).
	const bySeq = new Map<number, RedeemEvent[]>();
	for (const redeem of redeems) {
		const branch = bySeq.get(redeem.seq);
		if (branch) branch.push(redeem);
		else bySeq.set(redeem.seq, [redeem]);
	}

	const hashesBySeq = new Map<number, Set<string>>();
	for (const [seq, branch] of bySeq) {
		hashesBySeq.set(seq, new Set(branch.map(redeemHash)));
	}

	const accepted: AcceptedRedeem[] = [];
	const missingSeqs: number[] = [];
	let unitsUsed = 0;

	// 3 — walk the chain by position, from 1 to the highest position claimed.
	// Walking positions rather than events is what makes the fold
	// order-invariant, and it is also what closes the truncation hole: a log
	// that is missing position 3 is a log that has not fully replicated, not a
	// student with a spare class.
	const orderedSeqs = [...bySeq.keys()].sort((a, b) => a - b);
	const lowestSeq = orderedSeqs[0] ?? 0;
	const highestSeq = orderedSeqs.at(-1) ?? 0;

	// A signed event may still claim an absurd position. Positions past the
	// limit are refused outright instead of being walked, so one bad event
	// cannot turn the fold into a very long loop.
	const CHAIN_LIMIT = 10_000;
	if (highestSeq > CHAIN_LIMIT) {
		for (const seq of orderedSeqs.filter((s) => s > CHAIN_LIMIT)) {
			for (const event of bySeq.get(seq) ?? []) rejected.push({ event, reason: 'chain-break' });
			bySeq.delete(seq);
		}
	}
	const lastSeq = Math.min(highestSeq, CHAIN_LIMIT);

	const firstRedeemDate =
		lowestSeq > 0 ? ([...(bySeq.get(lowestSeq) ?? [])].sort(stableCompare)[0]?.date ?? null) : null;
	const window = issue ? validityWindow(issue, firstRedeemDate) : null;

	for (let seq = 1; seq <= lastSeq; seq++) {
		const branch = [...(bySeq.get(seq) ?? [])].sort(stableCompare);

		if (branch.length === 0) {
			// Positions are handed out monotonically, so a hole below the highest
			// claimed position is a redemption this device has not seen yet. Count
			// it as used: under-counting usage would mean handing out credit for a
			// log that simply has not caught up.
			missingSeqs.push(seq);
			unitsUsed += 1;
			continue;
		}

		if (branch.length > 1) {
			// A fork still costs one unit. Refusing to count it would turn a
			// rolled-back ledger into free classes — the exact attack layer 2 is
			// meant to make expensive.
			forks.push({ ticketId, seq, events: branch });
			for (const event of branch) rejected.push({ event, reason: 'forked-seq' });
			unitsUsed += 1;
			continue;
		}

		const redeem = branch[0];
		const reason = judgeRedeem(redeem, {
			issue,
			window,
			voidedBy,
			unitsUsed,
			isFirstRedeem: seq === lowestSeq,
			// null means "the predecessor has not replicated here" — unverifiable,
			// which is not the same as contradicted.
			prevHashes: hashesBySeq.get(seq - 1) ?? null
		});

		if (reason) {
			rejected.push({ event: redeem, reason });
			continue;
		}

		accepted.push({ event: redeem, hash: redeemHash(redeem) });
		unitsUsed += 1;
	}

	const unitsTotal = issue?.unitsTotal ?? null;
	const unitsRemaining = unitsTotal === null ? null : unitsTotal - unitsUsed;

	const lastEventAt = events.length > 0 ? (events.map(eventTime).sort().at(-1) ?? null) : null;

	return {
		ticketId,
		issue,
		status: deriveStatus({ issue, voidedBy, window, unitsRemaining, accepted, forks, ctx }),
		unitsTotal,
		unitsUsed,
		unitsRemaining,
		validFrom: window?.from ?? null,
		validUntil: window?.until ?? null,
		redeems: accepted,
		rejected,
		forks,
		missingSeqs,
		voidedBy,
		lastEventAt
	};
}

/** Everything that can disqualify a single redemption, in a fixed order. */
function judgeRedeem(
	redeem: RedeemEvent,
	state: {
		issue: IssueEvent | null;
		window: { from: IsoDate; until: IsoDate | null } | null;
		voidedBy: VoidEvent | null;
		unitsUsed: number;
		isFirstRedeem: boolean;
		prevHashes: Set<string> | null;
	}
): RejectionReason | null {
	// Without the issue event we do not know what this ticket is. The redeem is
	// held back rather than dropped — the issue usually arrives moments later.
	if (!state.issue) return 'no-issue';

	// Chain integrity is judged on what was written, independent of whether the
	// previous redemption was itself countable. A back-link can only be
	// contradicted by data we hold: when the predecessor has not replicated here
	// there is nothing to compare against, and refusing the redemption would
	// turn an incomplete log into free credit. The gap itself is already
	// counted as a used unit by the caller.
	if (redeem.seq === 1) {
		if (redeem.prevRedeemHash !== null) return 'chain-break';
	} else if (state.prevHashes && !state.prevHashes.has(redeem.prevRedeemHash ?? '')) {
		return 'chain-break';
	}

	if (state.voidedBy && redeem.redeemedAt > state.voidedBy.voidedAt) return 'voided';

	if (state.issue.courseId && redeem.courseId !== state.issue.courseId) return 'wrong-course';

	if (state.window) {
		// The redemption that *starts* a firstRedeem window cannot be outside it,
		// but it still may not predate the sale.
		const startsWindow = state.issue.validityStart === 'firstRedeem' && state.isFirstRedeem;
		const from = startsWindow ? state.issue.validFrom : state.window.from;
		if (redeem.date < from) return 'outside-validity';
		if (!startsWindow && state.window.until && redeem.date > state.window.until) {
			return 'outside-validity';
		}
	}

	// Time passes and series tickets (unitsTotal null) log attendance without
	// deducting anything, so they never run out.
	if (state.issue.unitsTotal !== null && state.unitsUsed >= state.issue.unitsTotal) {
		return 'no-units-left';
	}

	return null;
}

function deriveStatus(state: {
	issue: IssueEvent | null;
	voidedBy: VoidEvent | null;
	window: { from: IsoDate; until: IsoDate | null } | null;
	unitsRemaining: number | null;
	accepted: AcceptedRedeem[];
	forks: Fork[];
	ctx: LedgerContext;
}): TicketStatus {
	if (state.voidedBy) return 'voided';
	if (!state.issue) return 'unknown';
	if (
		state.issue.validityStart === 'firstRedeem' &&
		state.accepted.length === 0 &&
		state.forks.length === 0
	) {
		return 'dormant';
	}
	if (state.window?.until && state.ctx.today > state.window.until) return 'expired';
	if (state.unitsRemaining !== null && state.unitsRemaining <= 0) return 'exhausted';
	return 'active';
}

/**
 * Fold a whole student ledger — every ticket the student holds.
 *
 * @param events all events from `tickets-<studentDid>`, in any order
 */
export function reduceLedger(events: LedgerEvent[], ctx: LedgerContext): LedgerState {
	const byTicket = new Map<string, LedgerEvent[]>();
	for (const event of events) {
		const id = ticketIdOf(event);
		const bucket = byTicket.get(id);
		if (bucket) bucket.push(event);
		else byTicket.set(id, [event]);
	}

	const tickets = new Map<string, TicketState>();
	const forks: Fork[] = [];
	const rejected: Rejection[] = [];

	for (const ticketId of [...byTicket.keys()].sort()) {
		const state = reduceTicket(ticketId, byTicket.get(ticketId) ?? [], ctx);
		tickets.set(ticketId, state);
		forks.push(...state.forks);
		rejected.push(...state.rejected);
	}

	const lastEventAt = events.length > 0 ? (events.map(eventTime).sort().at(-1) ?? null) : null;

	return { tickets, forks, rejected, lastEventAt };
}

/**
 * Pre-flight for the check-in screen: may this ticket be redeemed for this
 * course on this day? Same rules as {@link reduceTicket} applies after the
 * fact, so the counter never writes a redemption the fold would then reject.
 */
export function canRedeem(
	state: TicketState,
	request: { courseId: string; date: IsoDate }
): { ok: boolean; reason?: RejectionReason | 'expired' } {
	if (!state.issue) return { ok: false, reason: 'no-issue' };
	if (state.voidedBy) return { ok: false, reason: 'voided' };
	if (state.issue.courseId && request.courseId !== state.issue.courseId) {
		return { ok: false, reason: 'wrong-course' };
	}
	if (state.unitsRemaining !== null && state.unitsRemaining <= 0) {
		return { ok: false, reason: 'no-units-left' };
	}

	const startsWindow = state.issue.validityStart === 'firstRedeem' && state.status === 'dormant';
	const from = startsWindow ? state.issue.validFrom : state.validFrom;
	if (from && request.date < from) return { ok: false, reason: 'outside-validity' };
	if (!startsWindow && state.validUntil && request.date > state.validUntil) {
		return { ok: false, reason: 'outside-validity' };
	}

	return { ok: true };
}

/**
 * The chain position and back-link the next redemption must carry. Reading
 * these off the current state — rather than off a counter — is what makes a
 * rolled-back ledger produce a detectable fork instead of a silent overwrite.
 */
export function nextChainPosition(state: TicketState): {
	seq: number;
	prevRedeemHash: string | null;
} {
	const rejectedRedeems = state.rejected
		.filter((r): r is Rejection & { event: RedeemEvent } => r.event.type === 'redeem')
		.map((r) => r.event);

	const positions = [
		...state.redeems.map((r) => r.event.seq),
		...state.forks.map((f) => f.seq),
		...rejectedRedeems.map((event) => event.seq)
	];

	if (positions.length === 0) return { seq: 1, prevRedeemHash: null };

	const highest = Math.max(...positions);

	// Link to *some* event at the previous position, not just an accepted one.
	// A rejected or forked predecessor still occupies its slot, and the chain
	// records what was written — pointing past it would break the next
	// verification instead of continuing the chain.
	const candidates = [
		...state.redeems.filter((r) => r.event.seq === highest).map((r) => r.event),
		...state.forks.filter((f) => f.seq === highest).flatMap((f) => f.events),
		...rejectedRedeems.filter((event) => event.seq === highest)
	];

	const previous = candidates[0];
	return {
		seq: highest + 1,
		prevRedeemHash: previous ? redeemHash(previous) : null
	};
}
