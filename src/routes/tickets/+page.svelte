<script>
	/**
	 * Ticket screen. Until the purchase flow lands (T4.2) this renders the
	 * balance reducer over sample events — including a forked one, because the
	 * alarm state has to be designed from the start, not bolted on when it first
	 * occurs in production.
	 */
	import TicketCard from '$lib/components/TicketCard.svelte';
	import { reduceTicket } from '$lib/ledger';
	import { context, issue, redeemChain } from '$lib/ledger/fixtures';
	import * as m from '$lib/paraglide/messages.js';

	const ctx = context({ today: '2026-09-01' });

	const tenClassPass = reduceTicket(
		'ticket:t1',
		[issue(), ...redeemChain(['2026-08-05', '2026-08-12', '2026-08-19'])],
		ctx
	);

	const monthlyPass = reduceTicket(
		'ticket:t2',
		[
			issue({ _id: 'ticket:t2', packageId: 'package:month', unitsTotal: null }),
			...redeemChain(['2026-08-20'], { ticketId: 'ticket:t2', _id: 'redeem:t2r1' })
		],
		ctx
	);

	const forkedPass = (() => {
		const [first] = redeemChain(['2026-08-05'], { ticketId: 'ticket:t3' });
		const rollback = { ...first, _id: 'redeem:t3-rollback', sig: 'sig-rollback' };
		return reduceTicket('ticket:t3', [issue({ _id: 'ticket:t3' }), first, rollback], ctx);
	})();
</script>

<h1 class="text-3xl font-bold">{m.nav_tickets()}</h1>

<p class="mt-2 max-w-xl text-sm text-warning" data-testid="demo-notice">
	{m.tickets_demo_notice()}
</p>

<div class="mt-6 grid gap-4">
	<TicketCard state={tenClassPass} title={m.tickets_demo_ten()} />
	<TicketCard state={monthlyPass} title={m.tickets_demo_month()} />
	<TicketCard state={forkedPass} title={m.tickets_demo_fork()} />
</div>
