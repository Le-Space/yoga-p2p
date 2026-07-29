// Ticket ledger — pure, UI-free, browser-free (docs/CLAUDE.md).
//
// Balances are never stored, only folded out of an append-only log. Everything
// exported here runs identically in the check-in screen and in a unit test.

export { canonicalJson, signingPayload, eventHash, redeemHash } from './canonical.js';
export { reduceTicket, reduceLedger, canRedeem, nextChainPosition, addDays } from './reduce.js';
export type {
	AcceptedRedeem,
	DeviceRecord,
	DeviceRegistry,
	Did,
	Fork,
	IsoDate,
	IsoTimestamp,
	IssueEvent,
	LedgerContext,
	LedgerEvent,
	LedgerState,
	PaymentMethod,
	RedeemEvent,
	Rejection,
	RejectionReason,
	SignatureVerdict,
	TicketState,
	TicketStatus,
	ValidityStart,
	VoidEvent
} from './types.js';
