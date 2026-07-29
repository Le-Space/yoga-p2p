<script>
	/**
	 * The till — selling a pass for cash (docs/PLAN.md §4.2).
	 *
	 * Only ever shown to a studio device, and only for students whose ledger this
	 * device actually holds: selling into a ledger you cannot see would produce a
	 * ticket nobody can verify.
	 *
	 * "Bar erhalten" writes one `issue` event, signed by this device. That event
	 * *is* the ticket — there is no second record to keep in step, and no balance
	 * field that could ever disagree with the log.
	 */
	import StudioGate from '$lib/components/StudioGate.svelte';
	import { canEditProgram } from '$lib/db/join.js';
	import { localized, packagesStore } from '$lib/db/program.js';
	import { devicesStore, studioStore } from '$lib/db/registry.js';
	import { issueTicket, studentTicketsStore } from '$lib/db/tickets.js';
	import { ownDidStore } from '$lib/p2p/node.js';
	import { getLocale } from '$lib/paraglide/runtime.js';
	import * as m from '$lib/paraglide/messages.js';

	let error = $state('');
	let sold = $state('');
	let studentDid = $state('');
	let packageId = $state('');

	let isStudioDevice = $derived(
		Boolean($studioStore) && Boolean($devicesStore) && canEditProgram()
	);

	let students = $derived([...$studentTicketsStore.values()]);

	/** @param {() => Promise<void>} action */
	async function run(action) {
		error = '';
		try {
			await action();
		} catch (/** @type {any} */ cause) {
			error = cause?.message ?? String(cause);
		}
	}

	async function sell(/** @type {SubmitEvent} */ event) {
		event.preventDefault();
		sold = '';

		await run(async () => {
			const student = $studentTicketsStore.get(studentDid);
			const pkg = $packagesStore.find((entry) => entry._id === packageId);
			if (!student || !pkg) throw new Error('Pick a student and a pass.');

			const own = $ownDidStore ?? '';
			const device = $devicesStore.find((entry) => entry.deviceDid === own);

			await issueTicket({
				db: student.db,
				studentDid,
				package: pkg,
				issuedBy: {
					deviceDid: own,
					// The owner has no device entry of her own; her studio has one
					// location per sale either way, and the booking's is the honest
					// fallback for a device that is not registered under a location.
					locationId: device?.locationId ?? ''
				},
				today: new Date().toISOString().slice(0, 10)
			});

			sold = localized(pkg.name, getLocale());
		});
	}
</script>

<h1 class="text-3xl font-bold">{m.till_title()}</h1>

<StudioGate>
	{#if error}
		<p class="mt-4 text-danger" role="alert" data-testid="till-error">
			{m.error_generic({ reason: error })}
		</p>
	{/if}

	{#if sold}
		<p class="mt-4 text-success" data-testid="till-sold">{m.till_sold({ package: sold })}</p>
	{/if}

	{#if isStudioDevice}
		<section class="mt-6 rounded-card border border-border bg-surface p-6">
			{#if students.length === 0}
				<p class="text-faint" data-testid="till-empty">{m.till_none()}</p>
			{:else}
				<form class="grid max-w-lg gap-3" onsubmit={sell}>
					<label class="grid gap-1 text-sm">
						{m.till_student()}
						<select
							data-testid="till-student"
							bind:value={studentDid}
							required
							class="rounded-control border p-2"
						>
							<option value="" disabled></option>
							{#each students as student (student.did)}
								<option value={student.did}>{student.did.slice(-12)}</option>
							{/each}
						</select>
					</label>

					<label class="grid gap-1 text-sm">
						{m.till_package()}
						<select
							data-testid="till-package"
							bind:value={packageId}
							required
							class="rounded-control border p-2"
						>
							<option value="" disabled></option>
							{#each $packagesStore as pkg (pkg._id)}
								<option value={pkg._id}>
									{localized(pkg.name, getLocale())} · {pkg.priceEUR} EUR
								</option>
							{/each}
						</select>
					</label>

					<button
						type="submit"
						data-testid="till-sell"
						class="justify-self-start rounded-control bg-accent px-4 py-2 font-medium text-accent-contrast"
					>
						{m.till_cash_received()}
					</button>
				</form>
			{/if}
		</section>
	{/if}
</StudioGate>
