<script>
	/**
	 * The balance display — the app's signature element (docs/PLAN.md §8.4).
	 *
	 * It is the trust interface of the whole idea, so it shows three things at
	 * once and never hides the third: what is left, how long it is valid, and
	 * how fresh this view is. "Stand vom …" is not decoration — without a
	 * server there is no other honest way to say how current a balance is.
	 */
	import { localized } from '$lib/db/program.js';
	import { locationsStore } from '$lib/db/registry.js';
	import * as m from '$lib/paraglide/messages.js';
	import { getLocale } from '$lib/paraglide/runtime.js';

	/**
	 * The counter's name rather than its id, on the one line where somebody has to
	 * act on what they read.
	 *
	 * The fork evidence is forensic — position, date, device, signature — and the
	 * location was the only part still written as `location:west`. The signature is
	 * what makes the entry provable; the place is what makes it *understandable*, so
	 * it gets the words. Falls back to the id, which is also what a device that has
	 * not replicated the registry can honestly say.
	 *
	 * @param {string} locationId
	 */
	function locationName(locationId) {
		if (!locationId) return '—';
		const location = $locationsStore.find((entry) => entry._id === locationId);
		return location ? localized(location.name, getLocale()) : locationId;
	}

	/** @type {{ state: import('$lib/ledger').TicketState, title?: string }} */
	let { state, title = '' } = $props();

	const STATUS_LABEL = {
		active: () => m.ticket_status_active(),
		dormant: () => m.ticket_status_dormant(),
		exhausted: () => m.ticket_status_exhausted(),
		expired: () => m.ticket_status_expired(),
		voided: () => m.ticket_status_voided(),
		unknown: () => m.ticket_status_unknown()
	};

	// Coral marks exactly one thing per view (brand rule): a balance that still
	// carries value. Everything spent or void steps back to muted.
	const STATUS_TONE = {
		active: 'text-accent',
		dormant: 'text-muted',
		exhausted: 'text-faint',
		expired: 'text-faint',
		voided: 'text-faint',
		unknown: 'text-warning'
	};

	/** @param {string | null} value */
	function formatDate(value) {
		if (!value) return '—';
		return new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium' }).format(
			new Date(`${value.slice(0, 10)}T00:00:00Z`)
		);
	}

	/** @param {string | null} value */
	function formatTimestamp(value) {
		if (!value) return '—';
		return new Intl.DateTimeFormat(getLocale(), {
			dateStyle: 'medium',
			timeStyle: 'short'
		}).format(new Date(value));
	}
</script>

<article
	class="rounded-card border border-border bg-surface p-6"
	data-testid="ticket-card"
	data-ticket-id={state.ticketId}
	data-status={state.status}
>
	{#if title}
		<p class="eyebrow" data-testid="ticket-title">{title}</p>
	{/if}

	<p class="mt-2 text-sm text-muted">{m.ticket_balance()}</p>

	<p class="mt-1 text-5xl font-bold {STATUS_TONE[state.status]}" data-testid="ticket-balance">
		{#if state.unitsRemaining === null}
			<span class="text-2xl">{m.ticket_unlimited()}</span>
		{:else}
			{state.unitsRemaining}
		{/if}
	</p>

	{#if state.unitsRemaining !== null && state.unitsTotal !== null}
		<p class="mt-1 text-sm text-muted" data-testid="ticket-units">
			{m.ticket_units_left({ count: state.unitsRemaining, total: state.unitsTotal })}
		</p>
	{/if}

	<!--
		Labels of their own, which they did not have. The status label was
		`ticket_status_active()` — the same word used as the *value* — so an active
		pass read "Gültig: Gültig", and the date label was a sentence template called
		with an empty parameter. Both showed up the moment the card was photographed
		for the handbook; on screen, in passing, neither looked like anything.
	-->
	<dl class="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
		<div>
			<dt class="text-faint">{m.ticket_label_status()}</dt>
			<dd data-testid="ticket-status">{STATUS_LABEL[state.status]()}</dd>
		</div>
		<div>
			<dt class="text-faint">{m.ticket_label_valid_until()}</dt>
			<dd data-testid="ticket-valid-until">{formatDate(state.validUntil)}</dd>
		</div>
	</dl>

	<!--
		Sync freshness sits inside the card, not in a corner of the screen: the
		number above means nothing without it.
	-->
	<p class="mt-4 border-t border-border pt-3 text-sm text-faint" data-testid="ticket-as-of">
		{m.sync_as_of({ date: formatTimestamp(state.lastEventAt) })}
	</p>

	{#if state.missingSeqs.length > 0}
		<p class="mt-2 text-sm text-warning" data-testid="ticket-incomplete">
			{m.ticket_status_unknown()} ({state.missingSeqs.length})
		</p>
	{/if}

	{#if state.forks.length > 0}
		<section
			class="mt-4 rounded-control border border-danger p-3 text-sm"
			data-testid="fork-alarm"
			role="alert"
		>
			<h3 class="font-bold text-danger">{m.fork_alarm_title()}</h3>
			<p class="mt-1 text-muted">{m.fork_alarm_body()}</p>
			<ul class="mt-2 space-y-1 font-mono text-xs text-faint">
				{#each state.forks as fork (fork.seq)}
					{#each fork.events as event (event._id)}
						<li data-testid="fork-proof">
							#{fork.seq} · {event.date} · {locationName(event.redeemedBy.locationId)} · {event.redeemedBy.deviceDid.slice(
								-12
							)} · {event.sig.slice(0, 16)}…
						</li>
					{/each}
				{/each}
			</ul>
		</section>
	{/if}
</article>
