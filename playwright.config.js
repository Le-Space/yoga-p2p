import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: 'e2e',
	timeout: 90_000,
	expect: { timeout: 30_000 },
	// A failing handshake is almost always a real failure, not a flake. One
	// retry in CI covers runner hiccups without hiding a broken transport.
	retries: process.env.CI ? 1 : 0,
	webServer: {
		command: 'pnpm run build && pnpm exec vite preview --port 4173 --strictPort',
		port: 4173,
		// Never reuse, not even locally. A server left running from an earlier run
		// serves the bundle it was built from, so a local run can silently test
		// code that no longer exists — which cost several debugging rounds where
		// a fix appeared not to work because it was never in the bundle.
		// Rebuilding costs ~20s; being wrong about what is under test costs more.
		reuseExistingServer: false,
		timeout: 240_000
	},
	use: {
		baseURL: 'http://localhost:4173',
		screenshot: 'only-on-failure',
		video: 'retain-on-failure',
		trace: 'on-first-retry'
	},
	projects: [
		{
			// Chromium is the gate: the QR transport is not upstream-tested on
			// Firefox or WebKit yet (docs/LIMITS.md). Those run nightly, non-blocking.
			name: 'chromium',
			// The screenshot run is not a test — it asserts almost nothing and writes
			// files into the handbook. Excluded here so the gate stays a gate, and run
			// on its own through `pnpm run screenshots`. The remote scenario is
			// excluded for a different reason: it brings its own browsers.
			testIgnore: [/screenshots\.spec\.js/, /remote\//],
			use: {
				...devices['Desktop Chrome'],
				launchOptions: {
					args: [
						// Camera path in CI: a fake device, so the real decoder runs
						// against a real MediaStream instead of a mocked one.
						'--use-fake-ui-for-media-stream',
						'--use-fake-device-for-media-stream',
						// Headless Chromium treats a page nothing is looking at as
						// backgrounded and throttles its timers and animation frames.
						// The offering device spends the handshake waiting on exactly
						// those, so it would sit at 'replying' while the answer was
						// already there - which is why the camera test passed with
						// --headed and failed without it.
						'--disable-background-timer-throttling',
						'--disable-backgrounding-occluded-windows',
						'--disable-renderer-backgrounding'
					]
				}
			}
		},
		// Only present when asked for, and that took a failing run to get right:
		// `testIgnore` above keeps the file out of the *chromium* project, but
		// `playwright test` with no `--project` runs every project there is — so the
		// generator joined the gate, competed with it for machines and timed out after
		// fifteen minutes. Existing conditionally is the only version of "excluded"
		// that actually excludes.
		// Same reasoning as the screenshots project below: conditional existence is
		// the only exclusion that actually excludes, since `playwright test` with
		// no --project runs every project there is. This one would otherwise start
		// its own browsers alongside the gate and compete with it for machines.
		...(process.env.REMOTE_SCENARIO
			? [
					{
						// Deliberately no `use.launchOptions`: this project never launches a
						// browser. Both devices are connected to, so anything set here would
						// be quietly ignored — see e2e/remote/providers.mjs.
						name: 'remote',
						testMatch: /remote-scenario\.spec\.js/,
						use: { ...devices['Desktop Chrome'] }
					}
				]
			: []),
		...(process.env.SCREENSHOT_LOCALE
			? [
					{
						// Same browser, same fixtures, different purpose: drive the app through
						// the states the handbook describes and photograph them. A fixed
						// viewport so the pictures line up with each other rather than with
						// whoever ran them.
						name: 'screenshots',
						testMatch: /screenshots\.spec\.js/,
						use: {
							...devices['Desktop Chrome'],
							viewport: { width: 1100, height: 800 },
							launchOptions: {
								args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']
							}
						}
					}
				]
			: [])
	]
});
