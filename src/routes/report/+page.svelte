<script>
	/**
	 * Reconciliation and the cash report (docs/PLAN.md §5, T5.3).
	 *
	 * Two counters that were out of touch will sometimes have sold a class twice
	 * over. This screen is where that stops being invisible: it folds every ledger
	 * this device holds, groups the takings by location and by device, and states
	 * every overdrawn pass with what it comes to in euros.
	 *
	 * The reconciliation itself needs no button. Bringing the two devices together —
	 * a QR handshake, or the paste path from across town — is what merges the logs;
	 * this screen simply reports what is here afterwards. That is the whole point of
	 * the courier design, and a "reconcile now" button would suggest otherwise.
	 */
	import CounterOnly from '$lib/components/CounterOnly.svelte';
	import StudioGate from '$lib/components/StudioGate.svelte';
	import { foldLedger } from '$lib/db/ledger-view.js';
	import { cashReport, cashTotal, findOverdrafts } from '$lib/db/reconcile.js';
	import { devicesStore, locationsStore } from '$lib/db/registry.js';
	import { localized } from '$lib/db/program.js';
	import { studentTicketsStore } from '$lib/db/tickets.js';
	import * as m from '$lib/paraglide/messages.js';
	import { getLocale } from '$lib/paraglide/runtime.js';

	let rows = $state(/** @type {import('$lib/db/reconcile.js').CashRow[]} */ ([]));
	let overdrafts = $state(/** @type {import('$lib/db/reconcile.js').Overdraft[]} */ ([]));

	$effect(() => {
		const students = [...$studentTicketsStore.values()];
		void $devicesStore;

		let cancelled = false;
		(async () => {
			const folded = await Promise.all(
				students.map(async (student) => ({
					did: student.did,
					state: await foldLedger(student.events)
				}))
			);
			if (cancelled) return;

			rows = cashReport(folded);
			overdrafts = findOverdrafts(folded);
		})();

		return () => {
			cancelled = true;
		};
	});

	/** @param {string} locationId */
	function locationName(locationId) {
		const location = $locationsStore.find((entry) => entry._id === locationId);
		return location ? localized(location.name, getLocale()) : locationId || '—';
	}

	/** @param {number} amount */
	function euro(amount) {
		return amount.toFixed(2);
	}
</script>

<h1 class="text-3xl font-bold">{m.report_title()}</h1>

<StudioGate>
	<CounterOnly>
		<section class="mt-6 rounded-card border border-border bg-surface p-6">
			<h2 class="eyebrow">{m.report_cash()}</h2>
			<p class="mt-1 text-sm text-muted">{m.report_cash_intro()}</p>

			{#if rows.length === 0}
				<p class="mt-3 text-faint" data-testid="report-empty">{m.report_none()}</p>
			{:else}
				<table class="mt-3 w-full text-sm" data-testid="cash-report">
					<thead class="text-left text-faint">
						<tr>
							<th class="py-1">{m.report_location()}</th>
							<th class="py-1">{m.report_device()}</th>
							<th class="py-1 text-right">{m.report_sales()}</th>
							<th class="py-1 text-right">{m.report_cash_eur()}</th>
							<th class="py-1 text-right">{m.report_redemptions()}</th>
							<th class="py-1 text-right">{m.report_disputed()}</th>
						</tr>
					</thead>
					<tbody>
						{#each rows as row (`${row.locationId}|${row.deviceDid}`)}
							<tr
								class="border-t border-border"
								data-testid="cash-row"
								data-location-id={row.locationId}
								data-device-did={row.deviceDid}
							>
								<td class="py-1">{locationName(row.locationId)}</td>
								<td class="py-1 font-mono text-xs">{row.deviceDid.slice(-12)}</td>
								<td class="py-1 text-right" data-testid="cash-sales">{row.sales}</td>
								<td class="py-1 text-right" data-testid="cash-eur">{euro(row.cashEUR)}</td>
								<td class="py-1 text-right" data-testid="cash-redemptions">{row.redemptions}</td>
								<td
									class="py-1 text-right {row.disputed > 0 ? 'text-danger' : ''}"
									data-testid="cash-disputed">{row.disputed}</td
								>
							</tr>
						{/each}
					</tbody>
					<tfoot>
						<tr class="border-t border-border font-medium">
							<td class="py-1" colspan="3">{m.report_total()}</td>
							<td class="py-1 text-right" data-testid="cash-total">{euro(cashTotal(rows))}</td>
							<td></td>
							<td></td>
						</tr>
					</tfoot>
				</table>
			{/if}
		</section>

		{#if overdrafts.length > 0}
			<section
				class="mt-6 rounded-card border border-danger bg-surface p-6"
				data-testid="overdraft-list"
				role="alert"
			>
				<h2 class="eyebrow text-danger">{m.report_overdraft()}</h2>
				<p class="mt-1 text-sm text-muted">{m.report_overdraft_intro()}</p>

				<ul class="mt-3 grid gap-2 text-sm">
					{#each overdrafts as overdraft (overdraft.ticketId)}
						<li
							data-testid="overdraft"
							data-student-did={overdraft.studentDid}
							data-units-over={overdraft.unitsOver}
						>
							{m.report_overdraft_row({
								student: overdraft.studentDid.slice(-12),
								units: overdraft.unitsOver,
								amount: euro(overdraft.rechargeEUR)
							})}
						</li>
					{/each}
				</ul>
			</section>
		{/if}
	</CounterOnly>
</StudioGate>
