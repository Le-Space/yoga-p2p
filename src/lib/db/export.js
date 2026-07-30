// Getting the data out (T5.2).
//
// Two reasons this exists, and only the second is the obvious one.
//
// A studio has to be able to answer a tax auditor, and "it is in a peer-to-peer
// database on the front desk iPad" is not an answer. So the export is plain JSON
// a person can read and a spreadsheet can open.
//
// The other reason matters more here: an export is the only thing that survives
// every device being lost at once. There is no server holding a copy, so the
// export *is* the backup — and it has to carry the **signed events**, not a
// summary of them. A balance in a spreadsheet proves nothing; the signed `issue`
// and `redeem` events can be re-verified against the registry by anyone, years
// later, without this app.

/**
 * @typedef {object} ExportBundle
 * @property {string} format
 * @property {string} exportedAt
 * @property {string} exportedBy the DID of the device that produced it
 * @property {any} [studio]
 * @property {any[]} [locations]
 * @property {any[]} [devices]
 * @property {any[]} [packages]
 * @property {any[]} [courses]
 * @property {Record<string, any[]>} [ledgers] signed events, keyed by student DID
 * @property {any[]} [bookings]
 */

export const EXPORT_FORMAT = 'yoga-p2p/export/1';

/**
 * Build an export bundle.
 *
 * Takes plain arrays rather than reaching for stores, so the shape is testable
 * without a browser and so a caller decides what to include — a student exporting
 * their own passes has no business shipping the studio's device registry.
 *
 * @param {object} parts
 * @param {string} parts.exportedBy
 * @param {string} parts.exportedAt
 * @param {any} [parts.studio]
 * @param {any[]} [parts.locations]
 * @param {any[]} [parts.devices]
 * @param {any[]} [parts.packages]
 * @param {any[]} [parts.courses]
 * @param {Record<string, any[]>} [parts.ledgers]
 * @param {any[]} [parts.bookings]
 * @returns {ExportBundle}
 */
export function buildExport({ exportedBy, exportedAt, ...rest }) {
	/** @type {any} */
	const bundle = { format: EXPORT_FORMAT, exportedAt, exportedBy };

	// Only what was actually passed. An empty `devices: []` in a student's export
	// would suggest the studio has no devices rather than that they were not asked
	// for, and a backup that implies things is worse than a smaller one.
	for (const [key, value] of Object.entries(rest)) {
		if (value === undefined) continue;
		bundle[key] = value;
	}

	return bundle;
}

/**
 * How many signed ledger events a bundle carries.
 *
 * Used by the UI to state the size of what it just handed over, because "export
 * complete" without a number is not something anyone can check.
 *
 * @param {ExportBundle} bundle
 */
export function countEvents(bundle) {
	return Object.values(bundle.ledgers ?? {}).reduce((total, events) => total + events.length, 0);
}

/**
 * Hand a bundle to the browser as a download.
 *
 * A blob URL and a synthetic click: no server to POST to, and nothing should leave
 * the device. Revoked immediately afterwards so the data does not sit in a URL that
 * outlives the click.
 *
 * @param {ExportBundle} bundle
 * @param {string} filename
 */
export function downloadExport(bundle, filename) {
	const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
	const url = URL.createObjectURL(blob);

	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	document.body.append(link);
	link.click();
	link.remove();

	URL.revokeObjectURL(url);
}

/**
 * A filename that sorts and does not collide.
 *
 * @param {string} prefix
 * @param {string} exportedAt ISO timestamp
 */
export function exportFilename(prefix, exportedAt) {
	return `${prefix}-${exportedAt.slice(0, 19).replaceAll(':', '')}.json`;
}
