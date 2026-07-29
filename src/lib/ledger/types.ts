// Ticket ledger event types (docs/PLAN.md §3.4).
//
// Every ticket fact is an append-only event. Nothing here is ever mutated and
// no balance is ever stored — the balance is a fold over the log, which is what
// makes multi-writer replication conflict-free.

/** A `did:key:…` identifier. */
export type Did = string;

/** A calendar day, `YYYY-MM-DD`. Lexicographic order equals chronological order. */
export type IsoDate = string;

/** A full ISO 8601 timestamp. */
export type IsoTimestamp = string;

/** Which device at which location produced an event. */
export interface DeviceRef {
	deviceDid: Did;
	locationId: string;
}

/**
 * Payment method. Cash is the only one v1 accepts at the counter; `transfer`
 * is what a `void`-and-reissue writes when a balance moves to a new DID
 * (docs/PLAN.md §6.2). The enum exists so PayPal/Bitcoin/direct debit can be
 * added later without a schema break.
 */
export type PaymentMethod = 'cash' | 'transfer';

/**
 * When a ticket's validity window starts: at purchase, or with the first
 * redemption. `firstRedeem` windows are unknown at issue time, so the ticket
 * carries `validityDays` and the window is derived by the reducer.
 */
export type ValidityStart = 'issue' | 'firstRedeem';

/** A ticket was sold. This event *is* the ticket. */
export interface IssueEvent {
	/** `ticket:<uuid>` */
	_id: string;
	type: 'issue';
	studentDid: Did;
	/** `package:<id>`, or null for a course-bound series ticket. */
	packageId: string | null;
	/** Set for series tickets — the ticket is only redeemable for this course. */
	courseId: string | null;
	/** Number of redeemable units, or null for time passes and series tickets. */
	unitsTotal: number | null;
	payment: {
		method: PaymentMethod;
		amountEUR: number;
		receivedAt: IsoTimestamp;
		/** Set when `method: 'transfer'` — the ticket this balance came from. */
		fromTicketId?: string | null;
	};
	issuedBy: DeviceRef;
	validFrom: IsoDate;
	/** Absolute end of the window; null when `validityStart: 'firstRedeem'`. */
	validUntil: IsoDate | null;
	validityStart: ValidityStart;
	/**
	 * Window length in days. Required for `validityStart: 'firstRedeem'`, where
	 * the absolute window can only be computed once the first redemption exists.
	 */
	validityDays?: number | null;
	/** Signature of the issuing device over the canonical event payload. */
	sig: string;
}

/** A visit was booked against a ticket. */
export interface RedeemEvent {
	/** `redeem:<uuid>` */
	_id: string;
	type: 'redeem';
	ticketId: string;
	/** 1-based position in this ticket's redeem chain. */
	seq: number;
	/** Hash of the redeem at `seq - 1`, or null at `seq === 1`. */
	prevRedeemHash: string | null;
	courseId: string;
	date: IsoDate;
	redeemedBy: DeviceRef;
	redeemedAt: IsoTimestamp;
	sig: string;
}

/** A ticket was cancelled: refunded, transferred to a new DID, or written off. */
export interface VoidEvent {
	/** `void:<uuid>` */
	_id: string;
	type: 'void';
	ticketId: string;
	reason: 'refund' | 'transfer' | 'lost-device';
	/** For `reason: 'transfer'` — the successor ticket carrying the balance. */
	transferTicketId?: string | null;
	voidedBy: DeviceRef;
	voidedAt: IsoTimestamp;
	sig: string;
}

export type LedgerEvent = IssueEvent | RedeemEvent | VoidEvent;

/** A device entry from the studio registry (docs/PLAN.md §3.1). */
export interface DeviceRecord {
	deviceDid: Did;
	role: 'owner' | 'front-desk' | 'teacher';
	locationId: string;
	grantedAt: IsoTimestamp;
	/** Set once the owner revoked this device. */
	revokedAt: IsoTimestamp | null;
}

/** The device half of the registry, keyed by device DID. */
export type DeviceRegistry = ReadonlyMap<Did, DeviceRecord>;

/** Why the reducer refused to count an event. */
export type RejectionReason =
	| 'unknown-device'
	| 'revoked-device'
	| 'bad-signature'
	| 'no-issue'
	| 'duplicate-id'
	| 'forked-seq'
	| 'chain-break'
	| 'wrong-course'
	| 'outside-validity'
	| 'no-units-left'
	| 'voided';

export interface Rejection {
	event: LedgerEvent;
	reason: RejectionReason;
}

/**
 * Two or more differently-signed redeems claiming the same position in a
 * ticket's chain. Both events are kept verbatim: their signatures are the
 * proof that someone showed a stale ledger (docs/PLAN.md §5, layer 2).
 */
export interface Fork {
	ticketId: string;
	seq: number;
	events: RedeemEvent[];
}

/** A redeem that passed every check and consumed a unit (if the ticket has units). */
export interface AcceptedRedeem {
	event: RedeemEvent;
	hash: string;
}

export type TicketStatus =
	| 'unknown' // redeems exist but the issue event has not replicated yet
	| 'dormant' // firstRedeem ticket, window not started
	| 'active'
	| 'exhausted' // all units used
	| 'expired' // past validUntil
	| 'voided';

export interface TicketState {
	ticketId: string;
	issue: IssueEvent | null;
	status: TicketStatus;
	unitsTotal: number | null;
	unitsUsed: number;
	/** null when the ticket has no unit accounting (time pass, series ticket). */
	unitsRemaining: number | null;
	/** Effective window — for `firstRedeem` tickets, derived from the first redemption. */
	validFrom: IsoDate | null;
	validUntil: IsoDate | null;
	redeems: AcceptedRedeem[];
	rejected: Rejection[];
	forks: Fork[];
	/**
	 * Chain positions below the highest one claimed for which no event has
	 * replicated here yet. Each counts as a used unit — an incomplete log must
	 * never read as spare credit — and tells the UI the view is not complete.
	 */
	missingSeqs: number[];
	voidedBy: VoidEvent | null;
	/** Newest event timestamp seen for this ticket — the "Stand vom …" of the UI. */
	lastEventAt: IsoTimestamp | null;
}

export interface LedgerState {
	tickets: Map<string, TicketState>;
	/** Every fork across all tickets, for the alarm screen. */
	forks: Fork[];
	rejected: Rejection[];
	lastEventAt: IsoTimestamp | null;
}

/**
 * Signature verdict for a single event, supplied by the caller.
 *
 * Verifying a WebAuthn signature is asynchronous and browser-bound, which the
 * reducer must not be. The app verifies first and passes a synchronous verdict
 * in; tests pass an explicit stub. There is no default — an unchecked ledger
 * must be a deliberate, visible choice at the call site.
 */
export type SignatureVerdict = (event: LedgerEvent) => boolean;

export interface LedgerContext {
	/** Device half of the registry. Events from unknown devices are rejected. */
	devices: DeviceRegistry;
	/** Signature check; see {@link SignatureVerdict}. */
	isSignatureValid: SignatureVerdict;
	/**
	 * "Today" for expiry decisions, `YYYY-MM-DD`. Only affects the derived
	 * `status`; whether a past redeem was inside its window is judged against
	 * the redeem's own date, never against now.
	 */
	today: IsoDate;
}
