// Drive the page with a virtual authenticator and reload it N times.
//
//   node repro/webauthn-identity-stability/run.mjs
//   node repro/webauthn-identity-stability/run.mjs --encryptKeystore=false

import { chromium } from 'playwright';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const encrypt = process.argv
	.slice(2)
	.filter((a) => a.startsWith('--'))
	.map((a) => a.slice(2))
	.join('&');
const query = encrypt ? '?' + encrypt : '';
const LOADS = 3;

const server = await createServer({
	root,
	configFile: `${root}vite.config.js`,
	server: { port: 5199 }
});
await server.listen();

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

// Virtual authenticator: the passkey has to be real WebAuthn, not a stub.
const cdp = await context.newCDPSession(page);
await cdp.send('WebAuthn.enable');
await cdp.send('WebAuthn.addVirtualAuthenticator', {
	options: {
		protocol: 'ctap2',
		ctap2Version: 'ctap2_1',
		transport: 'internal',
		hasResidentKey: true,
		hasUserVerification: true,
		isUserVerified: true,
		hasLargeBlob: true,
		automaticPresenceSimulation: true
	}
});

const results = [];

for (let load = 0; load < LOADS; load++) {
	await page.goto(`http://localhost:5199/${query}`);
	const result = await page
		.waitForFunction(() => window.__repro, null, { timeout: 120_000 })
		.then((handle) => handle.jsonValue());

	if (result.error) throw new Error(result.error);
	results.push(result);
	console.log(`load ${load + 1}: hash=${result.hash}`);
}

const ids = new Set(results.map((r) => r.id));
const hashes = new Set(results.map((r) => r.hash));
const keys = new Set(results.map((r) => r.publicKey));

console.log('');
console.log(`encryptKeystore: ${results[0].encryptKeystore}`);
console.log(
	`distinct DIDs over ${LOADS} loads:              ${ids.size}  ${ids.size === 1 ? '(stable)' : '(UNSTABLE)'}`
);
console.log(
	`distinct public keys over ${LOADS} loads:       ${keys.size}  ${keys.size === 1 ? '(stable)' : '(UNSTABLE)'}`
);
console.log(
	`distinct identity hashes over ${LOADS} loads:   ${hashes.size}  ${hashes.size === 1 ? '(stable)' : '(UNSTABLE)'}`
);

// Which field is responsible? Compare every field of the identity across loads.
console.log('\nfield stability:');
for (const field of ['id', 'publicKey', 'type']) {
	const distinct = new Set(results.map((r) => JSON.stringify(r[field])));
	console.log(
		`  ${field.padEnd(22)} ${distinct.size} distinct ${distinct.size === 1 ? '(stable)' : '(UNSTABLE)'}`
	);
}
for (const part of ['id', 'publicKey']) {
	const distinct = new Set(results.map((r) => r.signatures?.[part]));
	console.log(
		`  signatures.${part.padEnd(11)} ${distinct.size} distinct ${distinct.size === 1 ? '(stable)' : '(UNSTABLE)'}`
	);
}

await browser.close();
await server.close();

process.exit(hashes.size === 1 ? 0 : 1);
