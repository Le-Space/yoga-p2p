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
			use: {
				...devices['Desktop Chrome'],
				launchOptions: {
					args: [
						// Camera path in CI: a fake device, so the real decoder runs
						// against a real MediaStream instead of a mocked one.
						'--use-fake-ui-for-media-stream',
						'--use-fake-device-for-media-stream'
					]
				}
			}
		}
	]
});
