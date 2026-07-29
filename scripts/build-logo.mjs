// Build the app mark and every icon derived from it.
//
//   node scripts/build-logo.mjs
//
// The mark is variant A: the Le-Space network grammar with the OM sign in
// place of the local node. In the Le-Space language a filled coral circle is
// "this node, here, you" and cyan outlined circles are peers — so putting the
// OM exactly where the local node sits says the thing the app is about: your
// practice is the node, the studio and the other locations are peers.
//
// Two compositions, not one, because the brand guide requires it (section 06:
// "Ab 48 px abwärts gilt die vereinfachte Favicon-Variante: lokaler Knoten +
// ein Peer + eine Verbindung"). The full mark has two peers and three links;
// below 48 px that collapses into mud, so the small mark drops to one peer and
// one link and grows the glyph.
//
// On the OM itself: it is a sacred symbol in Hinduism, Buddhism and Jainism.
// It is used here whole, upright and unmodified — never mirrored, rotated,
// cropped or taken apart into decorative strokes. See docs/DESIGN.md.

import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { OM_GLYPH, omTransform } from '../src/lib/assets/om-glyph.js';

const CORAL = '#ff6b5b'; // Signal Coral — the local node
const CYAN = '#58c7f3'; // Sync Cyan — peers and connections
const DEEP = '#0b0e15'; // Deep Space — icon ground

const out = (name) => fileURLToPath(new URL(`../static/${name}`, import.meta.url));

/**
 * Full mark: OM as the local node, two peers, three connections.
 *
 * Deliberately calmer than the Le-Space original, which also carries a faint
 * fourth dot: a glyph reads busier than a solid disc, so the composition
 * around it has to give way.
 *
 * @param {string} omColor
 */
const fullMark = (omColor = CORAL) => `
	<path d="${OM_GLYPH.path}" fill="${omColor}" transform="${omTransform(34, 58, 46)}"/>
	<line x1="53" y1="44" x2="64" y2="32" stroke="${CYAN}" stroke-width="4" stroke-linecap="round"/>
	<line x1="56" y1="63" x2="69" y2="63" stroke="${CYAN}" stroke-width="4" stroke-linecap="round" stroke-dasharray="0.1 8"/>
	<line x1="74" y1="34" x2="77" y2="53" stroke="${CYAN}" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="0.1 6" opacity="0.65"/>
	<circle cx="71" cy="24" r="9" fill="none" stroke="${CYAN}" stroke-width="5"/>
	<circle cx="78" cy="62" r="7" fill="none" stroke="${CYAN}" stroke-width="4.5"/>`;

/** Small mark: one peer, one connection, a much larger glyph. */
const smallMark = (omColor = CORAL) => `
	<path d="${OM_GLYPH.path}" fill="${omColor}" transform="${omTransform(41, 55, 64)}"/>
	<line x1="66" y1="38" x2="75" y2="31" stroke="${CYAN}" stroke-width="5.5" stroke-linecap="round"/>
	<circle cx="83" cy="26" r="11" fill="none" stroke="${CYAN}" stroke-width="6"/>`;

/**
 * @param {string} body
 * @param {{ background?: string, padding?: number }} [options]
 */
function svg(body, { background = 'none', padding = 0 } = {}) {
	const ground =
		background === 'none' ? '' : `<rect width="100" height="100" fill="${background}"/>`;
	const inner = padding
		? `<g transform="translate(${padding} ${padding}) scale(${(100 - 2 * padding) / 100})">${body}</g>`
		: body;

	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${ground}${inner}\n</svg>\n`;
}

// ── SVG assets ───────────────────────────────────────────────────────────────
// Transparent ground and fixed brand colours: Coral and Cyan both clear AA on
// Deep Space and on Starlight, so one file serves the light and the dark theme.
writeFileSync(out('logo-mark.svg'), svg(fullMark()));
writeFileSync(out('favicon.svg'), svg(smallMark()));

// ── PNG assets ───────────────────────────────────────────────────────────────
const ICONS = [
	// Launcher icons sit on the Deep Space ground, like the Le-Space app icon.
	{ file: 'android-chrome-192x192.png', size: 192, body: fullMark(), background: DEEP },
	{ file: 'android-chrome-512x512.png', size: 512, body: fullMark(), background: DEEP },
	{ file: 'apple-touch-icon.png', size: 180, body: fullMark(), background: DEEP },
	// Maskable: Android crops to a circle, so everything lives inside the safe
	// zone — 20 % padding on each side is the platform's own guidance.
	{
		file: 'maskable-512x512.png',
		size: 512,
		body: fullMark(),
		background: DEEP,
		padding: 20
	},
	// The small mark, rasterised for browsers that ignore the SVG favicon.
	{ file: 'favicon-32x32.png', size: 32, body: smallMark(), background: 'none' },
	{ file: 'favicon-16x16.png', size: 16, body: smallMark(), background: 'none' }
];

const browser = await chromium.launch();

for (const { file, size, body, background, padding } of ICONS) {
	const markup = svg(body, { background, padding });
	const page = await browser.newPage({
		viewport: { width: size, height: size },
		deviceScaleFactor: 1
	});

	await page.setContent(
		`<!doctype html><html><head><style>
			*{margin:0;padding:0}
			html,body{width:${size}px;height:${size}px;background:transparent}
			svg{width:${size}px;height:${size}px;display:block}
		</style></head><body>${markup}</body></html>`,
		{ waitUntil: 'load' }
	);

	await page.screenshot({ path: out(file), omitBackground: background === 'none' });
	await page.close();
	console.log(`wrote static/${file}`);
}

await browser.close();

// ── favicon.ico ──────────────────────────────────────────────────────────────
// Browsers request /favicon.ico whether or not a page links to one, so leaving
// the previous file in place would keep serving the Le-Space mark under this
// app's name. An .ico is just a container, and it may hold PNGs directly — so
// the two rasters above are wrapped rather than re-encoded.
writeFileSync(
	out('favicon.ico'),
	buildIco([
		{ size: 16, png: readFileSync(out('favicon-16x16.png')) },
		{ size: 32, png: readFileSync(out('favicon-32x32.png')) }
	])
);
console.log('wrote static/favicon.ico');

console.log('wrote static/logo-mark.svg, static/favicon.svg');

/**
 * @param {{ size: number, png: Buffer }[]} images
 * @returns {Buffer}
 */
function buildIco(images) {
	const HEADER = 6;
	const ENTRY = 16;

	const header = Buffer.alloc(HEADER);
	header.writeUInt16LE(0, 0); // reserved
	header.writeUInt16LE(1, 2); // 1 = icon
	header.writeUInt16LE(images.length, 4);

	let offset = HEADER + ENTRY * images.length;
	const entries = images.map(({ size, png }) => {
		const entry = Buffer.alloc(ENTRY);
		entry.writeUInt8(size >= 256 ? 0 : size, 0); // 0 encodes 256
		entry.writeUInt8(size >= 256 ? 0 : size, 1);
		entry.writeUInt8(0, 2); // palette size — 0 for true colour
		entry.writeUInt8(0, 3); // reserved
		entry.writeUInt16LE(1, 4); // colour planes
		entry.writeUInt16LE(32, 6); // bits per pixel
		entry.writeUInt32LE(png.length, 8);
		entry.writeUInt32LE(offset, 12);
		offset += png.length;
		return entry;
	});

	return Buffer.concat([header, ...entries, ...images.map(({ png }) => png)]);
}
