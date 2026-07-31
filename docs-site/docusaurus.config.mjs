// Docusaurus configuration for the user documentation.
//
// This site is for the people who run and attend classes — a studio owner, whoever
// is at the front desk, a student with a phone. It is deliberately separate from
// `docs/`, which is the engineering record: plan, limits, privacy analysis. Mixing
// the two would leave both audiences reading past each other.
//
// German is the default locale because the first studios are German-speaking, and
// English is a full second locale rather than a fallback.

import { themes } from 'prism-react-renderer';

/** @type {import('@docusaurus/types').Config} */
export default {
	title: 'Yogasūcī (योगसूची)',
	tagline: 'Kursbuchung ohne Server',
	favicon: 'img/favicon.svg',

	// Two homes, one build. Alongside the app on Aleph at /handbuch/, and on GitHub
	// Pages at /yoga-p2p/ — the second exists because Pages does not need DNS and is
	// therefore the one that works today. Both are set from the environment rather
	// than hard-coded, because a Docusaurus site with the wrong baseUrl builds
	// happily and then serves a page whose every asset 404s.
	url: process.env.DOCS_URL ?? 'https://yoga.le-space.de',
	baseUrl: process.env.DOCS_BASE_URL ?? '/handbuch/',

	organizationName: 'Le-Space',
	projectName: 'yoga-p2p',

	// A broken link in a handbook sends somebody looking for an answer to a 404,
	// so it fails the build rather than warning into a log nobody reads.
	onBrokenLinks: 'throw',
	onBrokenMarkdownLinks: 'throw',

	i18n: {
		defaultLocale: 'de',
		locales: ['de', 'en'],
		localeConfigs: {
			de: { label: 'Deutsch', htmlLang: 'de-DE' },
			en: { label: 'English', htmlLang: 'en-GB' }
		}
	},

	presets: [
		[
			'classic',
			/** @type {import('@docusaurus/preset-classic').Options} */
			({
				docs: {
					routeBasePath: '/',
					sidebarPath: './sidebars.mjs',
					editUrl: 'https://github.com/Le-Space/yoga-p2p/tree/main/docs-site/'
				},
				blog: false,
				theme: { customCss: './src/css/custom.css' }
			})
		]
	],

	themeConfig: {
		image: 'img/social-card.png',
		colorMode: { defaultMode: 'dark', respectPrefersColorScheme: true },
		navbar: {
			title: 'Yogasūcī (योगसूची)',
			logo: { alt: 'Yogasūcī', src: 'img/om.svg' },
			items: [
				{ type: 'docSidebar', sidebarId: 'handbook', position: 'left', label: 'Handbuch' },
				{ type: 'localeDropdown', position: 'right' },
				{ href: 'https://github.com/Le-Space/yoga-p2p', label: 'GitHub', position: 'right' }
			]
		},
		footer: {
			style: 'dark',
			links: [
				{
					title: 'App',
					items: [{ label: 'yoga.le-space.de', href: 'https://yoga.le-space.de' }]
				},
				{
					title: 'Technik',
					items: [
						{
							label: 'Grenzen des Entwurfs',
							href: 'https://github.com/Le-Space/yoga-p2p/blob/main/docs/LIMITS.md'
						},
						{
							label: 'Datenschutz-Analyse',
							href: 'https://github.com/Le-Space/yoga-p2p/blob/main/docs/PRIVACY.md'
						}
					]
				}
			],
			copyright: 'Le-Space · Apache-2.0 OR MIT'
		},
		prism: { theme: themes.github, darkTheme: themes.dracula }
	}
};
