// Per-language entry pages, written after the build.
//
// The app decides its language in the browser — localStorage, then the browser
// preference, then German. That works for a person and is useless for a link:
// a crawler for a messenger or a social network reads the HTML it is served and
// leaves without running any JavaScript. With `ssr = false` there is exactly one
// shell for every path, so every link previewed anywhere came out German, and
// `/en/` was a 404.
//
// So each language gets a real file with its own <title>, description and
// Open Graph tags. A person who opens one is sent on to the app with the
// language already chosen; a crawler never gets that far and reads the tags,
// which is the whole point.
//
// Not a routing change: the app keeps one set of URLs. These are share links.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const BUILD = 'build';
const ORIGIN = 'https://yogasuci.le-space.de';

/** The key Paraglide reads before falling back to the browser preference. */
const LOCALE_KEY = 'PARAGLIDE_LOCALE';

const PAGES = [
	{
		locale: 'en',
		path: 'en/index.html',
		lang: 'en',
		ogLocale: 'en_GB',
		altLocale: 'de_DE',
		title: 'Yogasūcī (योगसूची) — class booking with no server and no account',
		description:
			'Peer-to-peer class booking for yoga studios: the programme, passes and check-in run directly between devices — no server, no account. Built with libp2p, OrbitDB and passkeys.',
		ogDescription:
			'Classes, passes and check-in run directly between devices. No server, no relay, no account.'
	},
	{
		locale: 'de',
		path: 'de/index.html',
		lang: 'de',
		ogLocale: 'de_DE',
		altLocale: 'en_GB',
		title: 'Yogasūcī (योगसूची) — Kursbuchung ohne Server und ohne Konto',
		description:
			'Peer-to-Peer-Kursbuchung für Yogastudios: Programm, Karten und Check-in laufen direkt zwischen den Geräten — ohne Server, ohne Konto. Gebaut mit libp2p, OrbitDB und Passkeys.',
		ogDescription:
			'Kurse, Karten und Check-in laufen direkt zwischen den Geräten. Kein Server, kein Relay, kein Konto.'
	}
];

/** @param {string} value */
function escapeHtml(value) {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

/** @param {(typeof PAGES)[number]} page */
function render(page) {
	const url = `${ORIGIN}/${page.locale}/`;

	return `<!doctype html>
<html lang="${page.lang}">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />

		<title>${escapeHtml(page.title)}</title>
		<meta name="description" content="${escapeHtml(page.description)}" />

		<!--
			Canonical points at the app, not at this page: this exists to be shared
			and previewed, not to be indexed as a second copy of the front page.
		-->
		<link rel="canonical" href="${ORIGIN}/" />
		<link rel="alternate" hreflang="de" href="${ORIGIN}/de/" />
		<link rel="alternate" hreflang="en" href="${ORIGIN}/en/" />
		<link rel="alternate" hreflang="x-default" href="${ORIGIN}/" />

		<meta property="og:type" content="website" />
		<meta property="og:site_name" content="Yogasūcī (योगसूची)" />
		<meta property="og:locale" content="${page.ogLocale}" />
		<meta property="og:locale:alternate" content="${page.altLocale}" />
		<meta property="og:url" content="${url}" />
		<meta property="og:title" content="${escapeHtml(page.title)}" />
		<meta property="og:description" content="${escapeHtml(page.ogDescription)}" />
		<meta property="og:image" content="${ORIGIN}/og-image.png" />
		<meta property="og:image:type" content="image/png" />

		<meta name="twitter:card" content="summary_large_image" />
		<meta name="twitter:title" content="${escapeHtml(page.title)}" />
		<meta name="twitter:description" content="${escapeHtml(page.ogDescription)}" />
		<meta name="twitter:image" content="${ORIGIN}/og-image.png" />

		<script>
			// Set the language the link promised, then hand over to the app. In a
			// try/catch because a browser with storage blocked must still get there —
			// it lands in its own preferred language, which is worse than asked for
			// and much better than a dead end.
			try {
				localStorage.setItem(${JSON.stringify(LOCALE_KEY)}, ${JSON.stringify(page.locale)});
			} catch {}
			location.replace('/');
		</script>
		<noscript><meta http-equiv="refresh" content="0; url=/" /></noscript>
	</head>
	<body>
		<p><a href="/">Yogasūcī</a></p>
	</body>
</html>
`;
}

let written = 0;

for (const page of PAGES) {
	const target = join(BUILD, page.path);
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, render(page), 'utf8');
	written++;
}

// The sitemap knows one URL; the share links are alternates of it, so they
// belong in it rather than being discoverable only by being sent to someone.
const sitemapPath = join(BUILD, 'sitemap.xml');

try {
	const sitemap = readFileSync(sitemapPath, 'utf8');

	if (!sitemap.includes(`${ORIGIN}/en/`)) {
		const alternates = PAGES.map(
			(page) =>
				`\t\t<xhtml:link rel="alternate" hreflang="${page.locale}" href="${ORIGIN}/${page.locale}/" />`
		).join('\n');

		writeFileSync(
			sitemapPath,
			sitemap
				.replace('<urlset', '<urlset xmlns:xhtml="http://www.w3.org/1999/xhtml"')
				.replace('</loc>', `</loc>\n${alternates}`),
			'utf8'
		);
	}
} catch {
	// No sitemap in this build; the share links still work.
}

console.log(`share links: ${written} written`);
