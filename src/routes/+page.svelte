<script>
	import * as m from '$lib/paraglide/messages.js';

	// Honest status page for the scaffold: these are the milestones from
	// docs/PLAN.md, and nothing here claims a screen that does not exist yet.
	const MILESTONES = [
		{ id: 'M1', label: () => m.milestone_m1() },
		{ id: 'M2', label: () => m.milestone_m2() },
		{ id: 'M3', label: () => m.milestone_m3() },
		{ id: 'M4', label: () => m.milestone_m4() },
		{ id: 'M5', label: () => m.milestone_m5() }
	];
</script>

<h1 class="text-4xl font-bold">{m.app_name()}</h1>
<p class="mt-2 max-w-xl text-lg text-muted">{m.app_tagline()}</p>

<section class="mt-8 rounded-card border border-border bg-surface p-6">
	<h2 class="eyebrow">{m.status_heading()}</h2>
	<ul class="mt-3 space-y-2" data-testid="milestones">
		{#each MILESTONES as milestone (milestone.id)}
			<li class="flex items-baseline gap-3">
				<span class="font-mono text-sm text-faint">{milestone.id}</span>
				<span class="text-muted">{milestone.label()}</span>
			</li>
		{/each}
	</ul>
</section>
