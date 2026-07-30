// A record of device introductions, deliberately dependency-free.
//
// Its own module because the alternative created an import cycle: the
// diagnostics in p2p/node.js need to read this, join.js needs to write it, and
// join.js reaches p2p/node.js through registry.js — which runs a subscription
// at module level and therefore breaks if it initialises mid-cycle. That broke
// the whole app boot once.
//
// Nothing here imports anything, so it can be read from either side safely.

/**
 * @type {{ direction: 'sent' | 'received' | 'failed', did: string, detail: string, at: string }[]}
 */
export const introductionLog = [];

/**
 * Record an introduction, or a failed attempt at one.
 *
 * A silent failure here is the worst kind: the connection looks healthy and the
 * counter simply cannot serve the person in front of it.
 *
 * @param {{ direction: 'sent' | 'received' | 'failed', did: string, detail?: string }} entry
 */
export function noteIntroduction(entry) {
	introductionLog.push({ ...entry, detail: entry.detail ?? '', at: new Date().toISOString() });
	// Bounded: a diagnostic, not a log store.
	if (introductionLog.length > 50) introductionLog.shift();
}
