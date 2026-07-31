<script>
	/**
	 * The front door.
	 *
	 * It used to be the scaffold's status page — a list of milestones M1 to M5,
	 * which is a developer's view of a repository and not an answer to the two
	 * questions somebody arriving at yoga.le-space.de actually has: what is this,
	 * and where do I start. It went to a live domain that way, which is exactly the
	 * sort of thing nobody notices from inside the project.
	 *
	 * There is no "log in" to point at, and that is the app rather than an omission:
	 * a device creates a passkey and *becomes* a studio or a student by what it does
	 * next. So both paths are named here, in the order somebody needs them, instead
	 * of being left to be discovered.
	 */
	import { base, resolve } from '$app/paths';
	import InstallHint from '$lib/components/InstallHint.svelte';
	import * as m from '$lib/paraglide/messages.js';

	const PATHS = /** @type {const} */ ([
		{
			path: '/studio',
			testid: 'start-studio',
			title: () => m.start_studio_title(),
			body: () => m.start_studio_body(),
			action: () => m.start_studio_action()
		},
		{
			path: '/connect',
			testid: 'start-student',
			title: () => m.start_student_title(),
			body: () => m.start_student_body(),
			action: () => m.start_student_action()
		}
	]);
</script>

<h1 class="text-4xl font-bold">{m.app_name()}</h1>
<p class="mt-2 max-w-xl text-lg text-muted">{m.app_tagline()}</p>

<p class="mt-4 max-w-xl text-muted" data-testid="start-intro">{m.start_intro()}</p>

<div class="mt-8 grid gap-4 sm:grid-cols-2" data-testid="start-paths">
	{#each PATHS as entry (entry.path)}
		<section class="rounded-card border border-border bg-surface p-6" data-testid={entry.testid}>
			<h2 class="eyebrow">{entry.title()}</h2>
			<p class="mt-2 text-sm text-muted">{entry.body()}</p>
			<a
				href={resolve(entry.path)}
				class="mt-4 inline-block rounded-control bg-accent px-4 py-2 text-sm font-medium text-accent-contrast no-underline"
			>
				{entry.action()}
			</a>
		</section>
	{/each}
</div>

<InstallHint />

<!--
	Not a footnote. Without a server there is nobody to ring when something is
	unclear, so the handbook is the support desk — it belongs where somebody sees it
	before they need it rather than after.

	A plain href, not `resolve()`: the handbook is a separate site published
	alongside this bundle, so it is not one of this app's routes.

	Underlined on purpose, and axe found the reason: a link inside a muted paragraph
	sat at 1.58:1 against the text around it, where the rule wants 3:1 for colour
	alone. Underlining is the other half of that rule and the better answer —
	tinting the paragraph darker to make a link stand out would fix the measurement
	by making the sentence harder to read.
-->
<p class="mt-8 text-sm text-muted">
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
	<a href="{base}/handbuch/" data-testid="start-handbook" class="underline">{m.start_handbook()}</a>
	· {m.start_handbook_hint()}
</p>
