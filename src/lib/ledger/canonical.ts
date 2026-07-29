// Canonical serialization and hashing for ledger events.
//
// Two different byte strings are derived from an event and they must not be
// confused:
//
//   signingPayload(event) — the event WITHOUT its signature. This is what a
//     studio device signs, and what a verifier re-derives to check the signature.
//
//   eventHash(event) — the event WITH its signature. This is what
//     `prevRedeemHash` points at, so the chain binds not just the content of the
//     previous redemption but also who signed it.
//
// Both walk objects in sorted key order so two devices that built the same
// event from the same facts produce identical bytes regardless of property
// insertion order.

import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import type { LedgerEvent, RedeemEvent } from './types.js';

/**
 * JSON with object keys in sorted order and `undefined` members dropped, so
 * that `{ a: 1, b: undefined }` and `{ a: 1 }` serialize identically. Arrays
 * keep their order — it is meaningful.
 */
export function canonicalJson(value: unknown): string {
	if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;

	const entries = Object.entries(value as Record<string, unknown>)
		.filter(([, v]) => v !== undefined)
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
		.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);

	return `{${entries.join(',')}}`;
}

/** The bytes a studio device signs: the event without its own signature. */
export function signingPayload(event: LedgerEvent): string {
	const { sig: _sig, ...rest } = event as LedgerEvent & { sig?: string };
	return canonicalJson(rest);
}

/** SHA-256 of the full signed event, hex encoded. */
export function eventHash(event: LedgerEvent): string {
	return bytesToHex(sha256(utf8ToBytes(canonicalJson(event))));
}

/**
 * Hash a redeem for use as the next event's `prevRedeemHash`.
 *
 * Same function as {@link eventHash}; named separately because the chain is
 * the security-relevant use and grepping for it should find every call site.
 */
export function redeemHash(event: RedeemEvent): string {
	return eventHash(event);
}
