import prettier from 'eslint-config-prettier';
import { includeIgnoreFile } from '@eslint/compat';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import ts from 'typescript-eslint';
import globals from 'globals';
import { fileURLToPath } from 'node:url';
import svelteConfig from './svelte.config.js';

const gitignorePath = fileURLToPath(new URL('./.gitignore', import.meta.url));

/** @type {import('eslint').Linter.Config[]} */
export default [
	includeIgnoreFile(gitignorePath),
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs.recommended,
	prettier,
	...svelte.configs.prettier,
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node }
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.js'],
		languageOptions: {
			globals: { ...globals.browser, ...globals.node, __APP_VERSION__: 'readonly' },
			parserOptions: { svelteConfig }
		}
	},
	{
		// `_`-prefixed bindings are the deliberate destructure-to-drop used in
		// signingPayload; everything else unused in the ledger is a real mistake.
		files: ['src/lib/ledger/**/*.ts'],
		rules: {
			'@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^_' }]
		}
	}
];
