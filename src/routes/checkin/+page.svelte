<script>
	/**
	 * Check-in at the counter (docs/PLAN.md §4.3).
	 *
	 * The sequence on this screen *is* the double-spend protection, so it is
	 * worth stating in order:
	 *
	 *   1. the student's device is connected, so their ledger replicates here —
	 *      including redemptions written at other locations, which they carried
	 *      with them as the courier;
	 *   2. this screen folds what arrived, verifying every signature against the
	 *      registry and checking the redemption chain;
	 *   3. only then can "Entwerten" write the next chain position.
	 *
	 * A counter working from a stale view reuses a position somebody else already
	 * took, and the result is a fork anyone can see rather than a quiet
	 * overwrite. Nothing here trusts a QR image or a token — the redemption is a
	 * verified ledger write, every time.
	 */
	import StudioGate from '$lib/components/StudioGate.svelte';
	import TicketCard from '$lib/components/TicketCard.svelte';
	import { canEditProgram } from '$lib/db/join.js';
	import { coursesStore, localized } from '$lib/db/program.js';
	import { devicesStore, studioStore } from '$lib/db/registry.js';
	import { redeemTicket, studentTicketsStore } from '$lib/db/tickets.js';
	import { foldFromDb, foldStudentLedger } from '$lib/db/ledger-view.js';
	import { ownDidStore } from '$lib/p2p/node.js';
	import { getLocale } from '$lib/paraglide/runtime.js';
	import * as m from '$lib/paraglide/messages.js';

	let error = $state('');
	let done = $state('');
	let studentDid = $state('');
	let courseId = $state('');
	let date = $state(new Date().toISOString().slice(0, 10));
	let tickets = $state(/** @type {any[]} */ ([]));

	let isStudioDevice = $derived(
		Boolean($studioStore) && Boolean($devicesStore) && canEditProgram()
	);

	let students = $derived([...$studentTicketsStore.values()]);

	// Refold whenever the selected student's ledger changes — a redemption
	// arriving from another location must change what this screen shows before
	// anyone presses the button.
	$effect(() => {
		void $studentTicketsStore;
		void $devicesStore;
		const did = studentDid;
		if (!did) {
			tickets = [];
			return;
		}

		let cancelled = false;
		(async () => {
			const folded = await foldStudentLedger(did, date);
			if (cancelled || !folded) return;
			tickets = [...folded.state.tickets.values()];
		})();

		return () => {
			cancelled = true;
		};
	});

	/** Turn a reducer verdict into something a person at a counter can act on. */
	function explain(/** @type {string} */ reason) {
		if (reason === 'wrong-course') return m.checkin_refused_wrong_course();
		if (reason === 'outside-validity') return m.checkin_refused_outside();
		if (reason === 'no-units-left') return m.checkin_refused_empty();
		if (reason === 'voided') return m.checkin_refused_voided();
		return m.checkin_refused_other({ reason });
	}

	async function redeem(/** @type {any} */ ticket) {
		error = '';
		done = '';

		try {
			const folded = await foldStudentLedger(studentDid, date);
			if (!folded) throw new Error('This student’s ledger is not open here.');

			// Fold again immediately before writing, not just for display: the
			// heads may have moved while the counter was looking at the screen.
			const fresh = folded.state.tickets.get(ticket.ticketId);
			if (!fresh) throw new Error('This ticket is no longer in the ledger.');

			const own = $ownDidStore ?? '';
			const device = $devicesStore.find((entry) => entry.deviceDid === own);

			// Where this happened, and it has to be answerable. The owner's device is
			// registered without a location — she is not tied to one — so falling back
			// to the *course's* location is the honest answer rather than leaving the
			// field empty. It was empty until the fork alarm exposed it: "the same
			// position was redeemed at two locations" is the one thing that makes a
			// fork actionable, and it read as "at two blanks".
			const course = $coursesStore.find((entry) => entry._id === courseId);
			const locationId = device?.locationId || course?.locationId || '';

			await redeemTicket({
				db: folded.db,
				state: fresh,
				courseId,
				date,
				redeemedBy: { deviceDid: own, locationId }
			});

			// Straight from the database: the store has not been told yet.
			const after = await foldFromDb(folded.db, date);
			const updated = after.tickets.get(ticket.ticketId);
			tickets = [...after.tickets.values()];
			done = m.checkin_done({
				balance: updated?.unitsRemaining ?? m.checkin_unlimited()
			});
		} catch (/** @type {any} */ cause) {
			const message = String(cause?.message ?? cause);
			error = message.startsWith('redeem-refused:')
				? explain(message.slice('redeem-refused:'.length))
				: message;
		}
	}
</script>

<h1 class="text-3xl font-bold">{m.checkin_title()}</h1>

<StudioGate>
	{#if error}
		<p class="mt-4 text-danger" role="alert" data-testid="checkin-error">{error}</p>
	{/if}

	{#if done}
		<p class="mt-4 text-success" data-testid="checkin-done">{done}</p>
	{/if}

	{#if isStudioDevice}
		<section class="mt-6 rounded-card border border-border bg-surface p-6">
			{#if students.length === 0}
				<p class="text-faint" data-testid="checkin-empty">{m.checkin_none()}</p>
			{:else}
				<div class="grid max-w-lg gap-3">
					<label class="grid gap-1 text-sm">
						{m.checkin_student()}
						<select
							data-testid="checkin-student"
							bind:value={studentDid}
							class="rounded-control border p-2"
						>
							<option value="" disabled></option>
							{#each students as student (student.did)}
								<option value={student.did}>{student.did.slice(-12)}</option>
							{/each}
						</select>
					</label>

					<label class="grid gap-1 text-sm">
						{m.checkin_course()}
						<select
							data-testid="checkin-course"
							bind:value={courseId}
							class="rounded-control border p-2"
						>
							<option value="" disabled></option>
							{#each $coursesStore as course (course._id)}
								<option value={course._id}>{localized(course.title, getLocale())}</option>
							{/each}
						</select>
					</label>

					<label class="grid gap-1 text-sm">
						{m.checkin_date()}
						<input
							type="date"
							data-testid="checkin-date"
							bind:value={date}
							class="rounded-control border p-2"
						/>
					</label>
				</div>
			{/if}
		</section>

		{#if studentDid}
			<div class="mt-6 grid gap-4" data-testid="checkin-tickets">
				{#each tickets as ticket (ticket.ticketId)}
					<div>
						<TicketCard state={ticket} />
						<button
							type="button"
							data-testid="checkin-redeem"
							data-ticket-id={ticket.ticketId}
							disabled={!courseId}
							onclick={() => redeem(ticket)}
							class="mt-2 rounded-control bg-accent px-4 py-2 font-medium text-accent-contrast disabled:opacity-50"
						>
							{m.checkin_redeem()}
						</button>
					</div>
				{:else}
					<p class="text-faint" data-testid="checkin-no-ticket">{m.checkin_no_ticket()}</p>
				{/each}
			</div>
		{/if}
	{/if}
</StudioGate>
