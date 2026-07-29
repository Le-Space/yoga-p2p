<script>
	/**
	 * My passes — the balance, folded from this device's own ledger.
	 *
	 * No demo data any more: what is shown is the result of `reduceLedger` over
	 * the events that actually replicated here, with signatures verified against
	 * the registry. A ticket sold at the counter appears because its `issue`
	 * event arrived, not because anything was told to display it.
	 */
	import TicketCard from '$lib/components/TicketCard.svelte';
	import { reduceLedger } from '$lib/ledger';
	import { verifySignatures } from '$lib/db/ledger-signing.js';
	import { deviceRegistry } from '$lib/db/registry.js';
	import { ticketEventsStore } from '$lib/db/tickets.js';
	import { devicesStore } from '$lib/db/registry.js';
	import StudioGate from '$lib/components/StudioGate.svelte';
	import * as m from '$lib/paraglide/messages.js';

	let tickets = $state(/** @type {any[]} */ ([]));

	// Signature verification is asynchronous and the reducer must stay pure, so
	// every event is verified first and the verdicts handed over as a lookup.
	$effect(() => {
		const events = $ticketEventsStore;
		void $devicesStore;

		let cancelled = false;

		(async () => {
			const isSignatureValid = await verifySignatures(events);
			if (cancelled) return;

			const state = reduceLedger(events, {
				devices: deviceRegistry(),
				isSignatureValid,
				today: new Date().toISOString().slice(0, 10)
			});

			tickets = [...state.tickets.values()];
		})();

		return () => {
			cancelled = true;
		};
	});
</script>

<h1 class="text-3xl font-bold">{m.nav_tickets()}</h1>

<StudioGate>
	{#if tickets.length === 0}
		<p class="mt-6 text-faint" data-testid="tickets-empty">{m.tickets_none()}</p>
	{:else}
		<div class="mt-6 grid gap-4">
			{#each tickets as ticket (ticket.ticketId)}
				<TicketCard state={ticket} />
			{/each}
		</div>
	{/if}
</StudioGate>
