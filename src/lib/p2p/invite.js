// Invite links: the same signed payload the QR carries, wrapped in a URL so it
// can travel through a share sheet.
//
// The link removes one leg of the handshake, not both. A WebRTC connection
// needs an answer, so the exchange stays two-way:
//
//   A: invite link  ──(share sheet / messenger)──▶  B opens it
//   B: reply link   ◀──(share sheet / messenger)──  A opens it
//
// What changes is that neither side has to know which string is which, or
// which field to paste it into: opening a link is the whole interaction, and
// this module is what tells the two apart.
//
// Everything the payload needs sits in the **fragment**, after the `#`.
// Browsers do not send that to a server, which is the only reason putting a
// handshake in a URL is defensible at all. It still travels through whatever
// messenger carries the link — the fragment protects it from our own hosting,
// not from the person you send it to.

/** Fragment key for an offer — kept to one character to spend nothing on QR budget. */
const INVITE_KEY = 'i';

/** Fragment key for the answer travelling back. */
const REPLY_KEY = 'r';

/**
 * @typedef {'invite' | 'reply'} LinkKind
 */

/**
 * Wrap a payload in a link that opens the connect screen.
 *
 * @param {object} options
 * @param {string} options.payload the signed offer or answer
 * @param {LinkKind} options.kind
 * @param {string} options.origin e.g. `https://yogasuci.le-space.de`
 * @param {string} [options.base] SvelteKit's base path, `''` at the site root
 * @returns {string}
 */
export function buildLink({ payload, kind, origin, base = '' }) {
	if (!payload) throw new Error('Cannot build a link without a payload.');

	const key = kind === 'reply' ? REPLY_KEY : INVITE_KEY;

	// encodeURIComponent, not the raw payload: the encoding is base64url-ish but
	// not guaranteed to be, and a stray '&' or '#' would truncate the fragment
	// into something that looks valid and is not.
	return `${origin}${base}/connect#${key}=${encodeURIComponent(payload)}`;
}

/**
 * Read a payload out of a fragment.
 *
 * Tolerates a leading '#' and extra parameters, so a link that picked up
 * tracking junk on the way through a messenger still works.
 *
 * @param {string} hash `location.hash`
 * @returns {{ kind: LinkKind, payload: string } | null}
 */
export function readLink(hash) {
	if (!hash) return null;

	const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);

	const invite = params.get(INVITE_KEY);
	if (invite) return { kind: 'invite', payload: invite };

	const reply = params.get(REPLY_KEY);
	if (reply) return { kind: 'reply', payload: reply };

	return null;
}

/**
 * How much a link costs over the bare payload, for the QR budget.
 *
 * The QR carries the *link*, so `QR_CHARACTER_BUDGET` has to cover this
 * overhead too. Measured rather than assumed, because percent-encoding makes
 * it depend on the payload: a character that needs escaping costs three.
 *
 * @param {object} options
 * @param {string} options.payload
 * @param {LinkKind} options.kind
 * @param {string} options.origin
 * @param {string} [options.base]
 * @returns {number}
 */
export function linkOverhead({ payload, kind, origin, base = '' }) {
	return buildLink({ payload, kind, origin, base }).length - payload.length;
}
