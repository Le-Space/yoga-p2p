<script>
	/**
	 * The app mark: the OM sign standing where the Le-Space local node stands,
	 * with cyan peers around it (docs/DESIGN.md).
	 *
	 * Inline SVG rather than an `<img>`, so the mark can take theme-aware
	 * colours. Its defaults are the brand's Coral and Cyan, which both clear AA
	 * on Deep Space and on Starlight — the same file works in both themes.
	 *
	 * `variant="small"` is the simplified composition the brand guide requires
	 * below 48 px: one peer, one connection, a larger glyph.
	 */
	import { OM_GLYPH, omTransform } from '$lib/assets/om-glyph.js';

	/**
	 * @type {{
	 *   size?: number,
	 *   variant?: 'full' | 'small',
	 *   title?: string,
	 *   class?: string
	 * }}
	 */
	let { size = 32, variant = 'small', title = '', class: className = '' } = $props();

	const CORAL = 'var(--ls-accent)';
	const CYAN = 'var(--ls-link)';
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 100 100"
	class={className}
	role={title ? 'img' : 'presentation'}
	aria-hidden={title ? undefined : 'true'}
	aria-label={title || undefined}
	data-testid="om-mark"
	data-variant={variant}
>
	{#if title}<title>{title}</title>{/if}

	{#if variant === 'full'}
		<path d={OM_GLYPH.path} fill={CORAL} transform={omTransform(34, 58, 46)} />
		<line x1="53" y1="44" x2="64" y2="32" stroke={CYAN} stroke-width="4" stroke-linecap="round" />
		<line
			x1="56"
			y1="63"
			x2="69"
			y2="63"
			stroke={CYAN}
			stroke-width="4"
			stroke-linecap="round"
			stroke-dasharray="0.1 8"
		/>
		<line
			x1="74"
			y1="34"
			x2="77"
			y2="53"
			stroke={CYAN}
			stroke-width="2.5"
			stroke-linecap="round"
			stroke-dasharray="0.1 6"
			opacity="0.65"
		/>
		<circle cx="71" cy="24" r="9" fill="none" stroke={CYAN} stroke-width="5" />
		<circle cx="78" cy="62" r="7" fill="none" stroke={CYAN} stroke-width="4.5" />
	{:else}
		<path d={OM_GLYPH.path} fill={CORAL} transform={omTransform(41, 55, 64)} />
		<line x1="66" y1="38" x2="75" y2="31" stroke={CYAN} stroke-width="5.5" stroke-linecap="round" />
		<circle cx="83" cy="26" r="11" fill="none" stroke={CYAN} stroke-width="6" />
	{/if}
</svg>
