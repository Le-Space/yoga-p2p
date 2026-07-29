import tailwindcss from '@tailwindcss/vite';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const file = fileURLToPath(new URL('package.json', import.meta.url));
const pkg = JSON.parse(readFileSync(file, 'utf8'));
const buildDate = new Date().toISOString();

export default defineConfig({
	test: {
		// The ledger is pure and must stay runnable without a browser
		// (CLAUDE.md) — node is the environment that proves it.
		environment: 'node',
		include: ['src/**/*.spec.{js,ts}']
	},
	plugins: [
		tailwindcss(),
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide',
			strategy: ['localStorage', 'preferredLanguage', 'baseLocale']
		}),
		sveltekit(),
		SvelteKitPWA({
			strategies: 'generateSW',
			registerType: 'autoUpdate',
			manifest: false, // static/manifest.webmanifest is the source of truth
			workbox: {
				globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest,woff2}'],
				// Helia/libp2p bundles are large; the default 2 MiB cap would drop them.
				maximumFileSizeToCacheInBytes: 8 * 1024 * 1024
			}
		}),
		nodePolyfills(
			/** @type {any} */ ({
				include: ['buffer', 'crypto', 'events', 'process', 'stream', 'util'],
				globals: { Buffer: true, global: true, process: true },
				protocolImports: true
			})
		)
	],
	define: {
		__APP_VERSION__: JSON.stringify(pkg.version),
		__BUILD_DATE__: JSON.stringify(buildDate)
	}
});
