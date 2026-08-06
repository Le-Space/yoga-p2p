// Where the second browser comes from.
//
// The whole point of the remote run is that device B is somewhere this machine
// is not, so the seam has to be the *browser*, not the page. Everything
// downstream takes a Browser and does not care how it was obtained — which is
// what lets the same scenario run locally, where both browsers are here, and in
// CI, where one of them is an Aleph VM in another network.
//
// Both providers `connect()` rather than `launch()`, including the local one.
// That is deliberate: a scenario that works against a launched browser and
// fails against a connected one would only reveal that in CI, and connecting to
// a server on this machine costs nothing to keep honest.

import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';

const CONNECT_TIMEOUT_MS = 120_000;
const SERVER_START_TIMEOUT_MS = 60_000;

/**
 * A browser served by a Playwright server started here.
 *
 * Reproduces the remote topology without a remote: the browser lives in another
 * process, reached over a websocket, so CDP — which the passkey authenticator
 * needs — has to survive the same trip it will make in CI.
 *
 * @returns {Promise<{ browser: import('@playwright/test').Browser, close: () => Promise<void>, evidence: object }>}
 */
export async function createServedBrowser() {
	const server = spawn('npx', ['playwright', 'launch-server', '--browser', 'chromium'], {
		stdio: ['ignore', 'pipe', 'inherit']
	});

	const wsEndpoint = await new Promise((resolve, reject) => {
		let buffer = '';
		const timer = setTimeout(
			() => reject(new Error('Playwright server printed no ws endpoint')),
			SERVER_START_TIMEOUT_MS
		);

		server.stdout.on('data', (chunk) => {
			buffer += chunk;
			const match = buffer.match(/ws:\/\/\S+/u);

			if (match) {
				clearTimeout(timer);
				resolve(match[0]);
			}
		});
	});

	const browser = await chromium.connect(wsEndpoint, { timeout: CONNECT_TIMEOUT_MS });

	return {
		browser,
		evidence: { kind: 'served', host: 'localhost' },
		close: async () => {
			await browser.close().catch(() => {});
			server.kill();
		}
	};
}

/**
 * A browser somewhere else, reached over an authenticated websocket.
 *
 * The Aleph Playwright runner puts a proxy in front of the Playwright server
 * that requires a bearer token, so the header travels with the connection.
 *
 * @param {{ wsEndpoint: string, secret?: string, evidence?: object }} options
 */
export async function createConnectedBrowser({ wsEndpoint, secret, evidence = {} }) {
	if (!wsEndpoint?.startsWith('ws')) {
		throw new Error('A remote browser needs a ws:// or wss:// endpoint.');
	}

	const browser = await chromium.connect(wsEndpoint, {
		timeout: CONNECT_TIMEOUT_MS,
		...(secret ? { headers: { authorization: `Bearer ${secret}` } } : {})
	});

	return {
		browser,
		evidence: { kind: 'connected', ...evidence },
		close: () => browser.close().catch(() => {})
	};
}
