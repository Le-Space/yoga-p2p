<script>
	import '$lib/styles/tokens.css';
	import { resolve } from '$app/paths';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import LanguageSwitch from '$lib/components/LanguageSwitch.svelte';
	import OmMark from '$lib/components/OmMark.svelte';
	import SyncStatus from '$lib/components/SyncStatus.svelte';
	import * as m from '$lib/paraglide/messages.js';

	let { children } = $props();

	// Route ids, resolved at the href. resolve() rather than a literal path is
	// what keeps the app working when it is served from a subpath — which is
	// exactly how it gets installed from an IPFS gateway.
	const NAV = /** @type {const} */ ([
		{ path: '/program', testid: 'nav-program', label: () => m.nav_program() },
		{ path: '/bookings', testid: 'nav-bookings', label: () => m.nav_bookings() },
		{ path: '/till', testid: 'nav-till', label: () => m.till_title() },
		{ path: '/checkin', testid: 'nav-checkin', label: () => m.checkin_title() },
		{ path: '/studio', testid: 'nav-studio', label: () => m.nav_registry() },
		{ path: '/tickets', testid: 'nav-tickets', label: () => m.nav_tickets() },
		{ path: '/connect', testid: 'nav-connect', label: () => m.nav_connect() }
	]);
</script>

<div class="min-h-screen bg-bg text-text">
	<header class="border-b border-border bg-surface">
		<div class="mx-auto flex max-w-4xl items-center gap-4 px-4 py-3">
			<a
				href={resolve('/')}
				class="flex items-center gap-2 font-mono font-bold text-text no-underline"
				data-testid="app-name"
			>
				<OmMark size={26} />
				{m.app_name()}
			</a>

			<nav class="flex flex-1 gap-1" aria-label={m.nav_program()}>
				{#each NAV as item (item.path)}
					<a
						href={resolve(item.path)}
						data-testid={item.testid}
						class="rounded-control px-3 py-1.5 text-sm text-muted no-underline transition hover:bg-surface-raised hover:text-text"
					>
						{item.label()}
					</a>
				{/each}
			</nav>

			<LanguageSwitch />
			<ThemeToggle />
		</div>
	</header>

	<SyncStatus />

	<main class="mx-auto max-w-4xl px-4 py-8">
		{@render children?.()}
	</main>
</div>
