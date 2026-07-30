<script>
	import '$lib/styles/tokens.css';
	import { resolve } from '$app/paths';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import LanguageSwitch from '$lib/components/LanguageSwitch.svelte';
	import OmMark from '$lib/components/OmMark.svelte';
	import SyncStatus from '$lib/components/SyncStatus.svelte';
	import { canEditProgram } from '$lib/db/join.js';
	import { devicesStore, studioStore } from '$lib/db/registry.js';
	import * as m from '$lib/paraglide/messages.js';

	let { children } = $props();

	// Route ids, resolved at the href. resolve() rather than a literal path is
	// what keeps the app working when it is served from a subpath — which is
	// exactly how it gets installed from an IPFS gateway.
	//
	// `counter: true` marks the screens that belong behind the desk. They used to
	// be shown to everybody, so a student had eight entries of which four led to a
	// heading and an empty page: the till, check-in, the registry and the cash
	// report all render nothing without a studio role. Four dead ends out of eight
	// is not a navigation, it is a guess about who you are.
	//
	// Not two separate apps, though, and that is deliberate. A studio device is
	// also somebody's device — the owner books classes herself, which is why
	// /bookings shows "mine" and "incoming" on one screen. Splitting the app in two
	// would make her switch between them for two things she does in the same
	// minute. So one app, and a navigation that shows what this device can do.
	const NAV = /** @type {const} */ ([
		{ path: '/program', testid: 'nav-program', label: () => m.nav_program() },
		{ path: '/bookings', testid: 'nav-bookings', label: () => m.nav_bookings() },
		{ path: '/tickets', testid: 'nav-tickets', label: () => m.nav_tickets() },
		{ path: '/till', testid: 'nav-till', label: () => m.till_title(), counter: true },
		{ path: '/checkin', testid: 'nav-checkin', label: () => m.checkin_title(), counter: true },
		{ path: '/studio', testid: 'nav-studio', label: () => m.nav_registry(), counter: true },
		{ path: '/report', testid: 'nav-report', label: () => m.nav_report(), counter: true },
		{ path: '/connect', testid: 'nav-connect', label: () => m.nav_connect() }
	]);

	// Reading both stores is what makes this re-run: `canEditProgram()` reaches into
	// them without subscribing, so on its own it would answer once and never again —
	// and a device approved a minute ago would keep the student's navigation until
	// the next reload.
	let isCounter = $derived(Boolean($studioStore) && Boolean($devicesStore) && canEditProgram());

	let visible = $derived(NAV.filter((item) => !('counter' in item) || isCounter));
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
				{#each visible as item (item.path)}
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
