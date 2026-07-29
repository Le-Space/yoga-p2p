<script>
	/**
	 * Light/dark toggle. Sets `data-theme` on <html>, persists the choice and
	 * keeps <meta name="theme-color"> in sync so the PWA status bar follows.
	 * The initial value is applied before first paint by the inline script in
	 * app.html — this component only ever flips an already-correct state.
	 */
	import { onMount } from 'svelte';
	import * as m from '$lib/paraglide/messages.js';

	const THEME_COLORS = { dark: '#0B0E15', light: '#EDF1F8' };

	let theme = $state('dark');

	onMount(() => {
		theme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
	});

	/** @param {'light' | 'dark'} next */
	function apply(next) {
		theme = next;
		document.documentElement.dataset.theme = next;

		try {
			localStorage.setItem('theme', next);
		} catch {
			// Storage blocked — the toggle still works for this session.
		}

		document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[next]);
	}
</script>

<button
	type="button"
	data-testid="theme-toggle"
	data-theme-state={theme}
	onclick={() => apply(theme === 'dark' ? 'light' : 'dark')}
	class="rounded-control p-2 text-muted transition hover:bg-surface-raised hover:text-text"
	aria-label={m.theme_toggle()}
	title={theme === 'dark' ? m.theme_light() : m.theme_dark()}
>
	{#if theme === 'dark'}
		<svg
			width="20"
			height="20"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			aria-hidden="true"
		>
			<circle cx="12" cy="12" r="4" />
			<path
				d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
			/>
		</svg>
	{:else}
		<svg
			width="20"
			height="20"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			aria-hidden="true"
		>
			<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
		</svg>
	{/if}
</button>
