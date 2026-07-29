<script>
	/**
	 * DE/EN switch. Paraglide resolves the locale from localStorage first and
	 * the browser preference second (see the strategy in vite.config.js), so an
	 * explicit choice sticks and an unset one follows the device.
	 */
	import { getLocale, locales, setLocale } from '$lib/paraglide/runtime.js';
	import * as m from '$lib/paraglide/messages.js';

	const LABELS = /** @type {Record<string, string>} */ ({ de: 'DE', en: 'EN' });

	let current = $state(getLocale());
</script>

<div
	class="flex items-center gap-1"
	role="group"
	aria-label={m.language_switch()}
	data-testid="language-switch"
>
	{#each locales as locale (locale)}
		<button
			type="button"
			data-testid={`language-${locale}`}
			aria-pressed={current === locale}
			onclick={() => setLocale(locale)}
			class="rounded-control px-2 py-1 font-mono text-sm transition
				{current === locale
				? 'bg-surface-raised text-text'
				: 'text-faint hover:bg-surface-raised hover:text-muted'}"
		>
			{LABELS[locale] ?? locale.toUpperCase()}
		</button>
	{/each}
</div>
