// Render the social preview card to static/og-image.png.
//
// Run manually when the wording or the brand tokens change:
//   node scripts/build-og-image.mjs
//
// Generated rather than hand-drawn so the card cannot drift away from the
// tokens in src/lib/styles/tokens.css. The values below are the dark-theme
// tokens, quoted here because this file runs outside the bundler and cannot
// import the stylesheet. Any change to them belongs in docs/DESIGN.md first.

import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

const OUTPUT = fileURLToPath(new URL('../static/og-image.png', import.meta.url));

const TOKENS = {
	bg: '#0b0e15', // Deep Space
	surface: '#141926', // Nebula
	border: '#232b3d', // Horizon
	text: '#edf1f8', // Starlight
	muted: '#a8b3c7', // Stardust
	accent: '#ff6b5b', // Signal Coral
	link: '#58c7f3' // Sync Cyan
};

const card = `
<!doctype html>
<html>
	<head>
		<meta charset="utf-8" />
		<style>
			* { margin: 0; padding: 0; box-sizing: border-box; }
			body {
				width: 1200px; height: 630px;
				background: ${TOKENS.bg};
				color: ${TOKENS.text};
				font-family: Inter, -apple-system, 'Segoe UI', Roboto, sans-serif;
				display: flex; flex-direction: column; justify-content: center;
				padding: 88px;
				position: relative;
			}
			.eyebrow {
				font-family: 'JetBrains Mono', ui-monospace, monospace;
				font-weight: 700; font-size: 22px;
				text-transform: uppercase; letter-spacing: 0.08em;
				color: ${TOKENS.accent};
			}
			h1 { font-size: 76px; line-height: 1.05; margin-top: 20px; letter-spacing: -0.02em; }
			p { font-size: 30px; line-height: 1.45; color: ${TOKENS.muted}; margin-top: 26px; max-width: 900px; }
			.stack {
				margin-top: 52px; display: flex; gap: 14px;
				font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 20px;
			}
			.chip {
				border: 1px solid ${TOKENS.border}; background: ${TOKENS.surface};
				border-radius: 8px; padding: 10px 18px; color: ${TOKENS.muted};
			}
			/* One coral element per view — the brand rule holds here too. */
			.rule { position: absolute; left: 0; top: 0; bottom: 0; width: 12px; background: ${TOKENS.accent}; }
			.wordmark {
				position: absolute; right: 88px; bottom: 72px;
				font-family: 'JetBrains Mono', ui-monospace, monospace;
				font-size: 22px; color: ${TOKENS.link};
			}
		</style>
	</head>
	<body>
		<div class="rule"></div>
		<div class="eyebrow">Local-first · Peer-to-Peer</div>
		<h1>Yoga-Buchung</h1>
		<p>Kurse, Karten und Check-in laufen direkt zwischen den Geräten — ohne Server, ohne Konto.</p>
		<div class="stack">
			<span class="chip">WebRTC per QR</span>
			<span class="chip">OrbitDB</span>
			<span class="chip">Passkey-DID</span>
		</div>
		<div class="wordmark">Le-Space</div>
	</body>
</html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });

await page.setContent(card, { waitUntil: 'load' });
await page.screenshot({ path: OUTPUT });
await browser.close();

console.log(`wrote ${OUTPUT}`);
