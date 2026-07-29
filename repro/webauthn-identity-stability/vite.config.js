import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

// Same polyfill set the app uses — the point of the repro is the identity, not
// a bundler difference.
export default defineConfig({
	plugins: [
		nodePolyfills({
			include: ['buffer', 'crypto', 'events', 'process', 'stream', 'util'],
			globals: { Buffer: true, global: true, process: true },
			protocolImports: true
		})
	]
});
