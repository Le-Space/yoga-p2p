<script>
	/**
	 * Offering to install the app (T#25).
	 *
	 * The app has been installable since the first milestone — service worker,
	 * manifest, icons, offline caching — and nothing has ever said so. For a studio
	 * that matters more than it would for a website: installed, it opens without
	 * browser chrome on a front-desk tablet, and the offline behaviour the whole
	 * design rests on stops looking like a broken page.
	 *
	 * Two paths, because the platforms differ and pretending otherwise leaves iOS
	 * users with a button that does nothing:
	 *
	 *   - Chromium fires `beforeinstallprompt`, which can be saved and replayed from
	 *     a click of our own. That is the real installation dialogue.
	 *   - Safari on iOS has no such event and never will. There, the only honest
	 *     thing is to describe the two taps: Share, then "Add to Home Screen".
	 *
	 * Dismissed once, gone for good. An install banner that returns on every visit
	 * is the thing people learn to close without reading, which is worse than not
	 * asking.
	 */
	import { onMount } from 'svelte';

	import * as m from '$lib/paraglide/messages.js';

	const DISMISSED_KEY = 'yoga-p2p.installHintDismissed';

	let prompt = $state(/** @type {any} */ (null));
	let showIosSteps = $state(false);
	let dismissed = $state(true);

	onMount(() => {
		try {
			dismissed = localStorage.getItem(DISMISSED_KEY) === 'true';
		} catch {
			// Storage blocked: show the hint rather than swallow it. Somebody who
			// cannot be remembered is exactly who might want the app on their screen.
			dismissed = false;
		}

		// Already installed — asking again would be noise.
		if (window.matchMedia?.('(display-mode: standalone)').matches) {
			dismissed = true;
			return;
		}

		/** @param {any} event */
		const capture = (event) => {
			// Chromium shows its own bar otherwise, at a moment we do not choose.
			event.preventDefault();
			prompt = event;
		};

		window.addEventListener('beforeinstallprompt', capture);

		// iOS: no event to wait for, so it is detected rather than awaited. Checked
		// via `standalone`, which only Safari defines, plus the touch-capable Mac
		// user agent that iPads have reported since iPadOS 13.
		const ios =
			/iphone|ipad|ipod/i.test(navigator.userAgent) ||
			(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
		showIosSteps = ios && !('standalone' in navigator && navigator.standalone);

		return () => window.removeEventListener('beforeinstallprompt', capture);
	});

	async function install() {
		if (!prompt) return;
		await prompt.prompt();
		// Whatever they chose, the browser will not hand the same event over twice.
		prompt = null;
		dismiss();
	}

	function dismiss() {
		dismissed = true;
		try {
			localStorage.setItem(DISMISSED_KEY, 'true');
		} catch {
			// Not remembered, shown again next time. Not worth failing over.
		}
	}
</script>

{#if !dismissed && (prompt || showIosSteps)}
	<section
		class="mt-8 rounded-card border border-border bg-surface p-6"
		data-testid="install-hint"
		data-mode={prompt ? 'prompt' : 'ios'}
	>
		<h2 class="eyebrow">{m.install_title()}</h2>
		<p class="mt-2 max-w-xl text-sm text-muted">{m.install_body()}</p>

		<div class="mt-4 flex flex-wrap items-center gap-3">
			{#if prompt}
				<button
					type="button"
					data-testid="install-now"
					onclick={install}
					class="rounded-control bg-accent px-4 py-2 text-sm font-medium text-accent-contrast"
				>
					{m.install_action()}
				</button>
			{:else}
				<p class="text-sm text-muted" data-testid="install-ios-steps">{m.install_ios()}</p>
			{/if}

			<button
				type="button"
				data-testid="install-dismiss"
				onclick={dismiss}
				class="rounded-control border border-border px-3 py-1.5 text-sm"
			>
				{m.install_dismiss()}
			</button>
		</div>
	</section>
{/if}
