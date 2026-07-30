<script>
	/**
	 * Connection assistant — the only way two devices ever meet.
	 *
	 * Three carriers for the same signed payload: QR (the studio path), copy &
	 * paste (the universal fallback) and share (messengers, for remote setup).
	 * The wizard is deliberately explicit about which step the user is on,
	 * because a failed handshake has no server-side retry to fall back on and a
	 * vague error would leave people stuck.
	 */
	import { onDestroy } from 'svelte';
	import StudioGate from '$lib/components/StudioGate.svelte';
	import { connectedPeersStore, hangUp, peerIdStore, signallingStore } from '$lib/p2p/node.js';
	import { fitsInQrCode, renderQrCode, scanWithCamera, sharePayload } from '$lib/p2p/qr.js';
	import { introduceToPeer, joinStore, joinStudioFromPeer } from '$lib/db/join.js';
	import { studioStore } from '$lib/db/registry.js';
	import * as m from '$lib/paraglide/messages.js';

	/** @type {'idle' | 'offering' | 'answering' | 'connecting' | 'connected' | 'failed'} */
	let step = $state('idle');
	let payload = $state('');
	let qrDataUrl = $state('');
	let qrError = $state('');
	let inbound = $state('');
	let failure = $state('');
	let copied = $state(false);
	let scanning = $state(false);

	/** @type {HTMLVideoElement | undefined} */
	let video = $state();
	/** @type {HTMLCanvasElement | undefined} */
	let canvas = $state();
	/** @type {AbortController | null} */
	let scanAbort = null;

	// The node belongs to the session, not to this page. Starting and stopping it
	// here was the bug behind "the registry is not open": leaving the page tore
	// down the databases the studio screens were still holding. StudioGate owns
	// the lifecycle now; this page only cancels its own scanner.
	onDestroy(() => {
		scanAbort?.abort();
	});

	/**
	 * Ask the other device which studio it belongs to, and open it here.
	 *
	 * Only for a device that has not set up a studio of its own — a studio
	 * owner connecting to a student must not be pulled into the student's empty
	 * one. An unnamed studio is the marker for "this device has never been set
	 * up", which is exactly the case a student device is in.
	 */
	async function greetAndMaybeJoin(/** @type {string} */ remotePeerId) {
		// Always introduce: a counter cannot sell to, or check in, a device whose
		// DID and ledger address it was never told — and that is true whether or
		// not this device already belongs to a studio.
		await introduceToPeer(remotePeerId);

		// Joining is the other half, and only for a device that has not been set
		// up: a studio owner connecting to a student must not be pulled into the
		// student's empty studio.
		if ($studioStore?.name) return;

		try {
			await joinStudioFromPeer(remotePeerId);
		} catch {
			// Surfaced through joinStore; the connection itself stays usable.
		}
	}

	async function showPayload(/** @type {string} */ text) {
		payload = text;
		qrError = '';
		qrDataUrl = '';

		if (!fitsInQrCode(text)) {
			// Do not render a code no camera can resolve — say so and let the user
			// take the paste path instead.
			qrError = m.connect_paste();
			return;
		}

		try {
			qrDataUrl = await renderQrCode(text);
		} catch (/** @type {any} */ error) {
			qrError = error?.message ?? String(error);
		}
	}

	async function createOffer() {
		failure = '';
		try {
			const offer = await $signallingStore.createOffer();
			await showPayload(offer);
			step = 'offering';
		} catch (/** @type {any} */ error) {
			failure = error?.message ?? String(error);
			step = 'failed';
		}
	}

	/** Handle a payload that arrived by scan, paste or share — same code path. */
	async function handleInbound(/** @type {string} */ text) {
		const trimmed = text.trim();
		if (!trimmed) return;

		failure = '';
		try {
			const kind = await $signallingStore.classify(trimmed);

			if (kind === 'offer') {
				step = 'answering';
				const { answer, remotePeerId, connected } = await $signallingStore.acceptOffer(trimmed);
				await showPayload(answer);
				connected
					.then(async () => {
						step = 'connected';
						await greetAndMaybeJoin(remotePeerId);
					})
					.catch((/** @type {any} */ error) => {
						failure = error?.message ?? String(error);
						step = 'failed';
					});
				return;
			}

			step = 'connecting';
			const remotePeerId = await $signallingStore.acceptAnswer(trimmed);
			step = 'connected';
			await greetAndMaybeJoin(remotePeerId);
		} catch (/** @type {any} */ error) {
			failure = error?.message ?? String(error);
			step = 'failed';
		}
	}

	async function scan() {
		if (!video || !canvas) return;

		scanAbort = new AbortController();
		scanning = true;
		failure = '';

		try {
			const text = await scanWithCamera({ video, canvas, signal: scanAbort.signal });
			await handleInbound(text);
		} catch (/** @type {any} */ error) {
			if (error?.name !== 'AbortError') {
				failure = error?.message ?? String(error);
				step = 'failed';
			}
		} finally {
			scanning = false;
			scanAbort = null;
		}
	}

	async function copy() {
		await navigator.clipboard.writeText(payload);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}

	async function share() {
		try {
			await sharePayload({ title: m.connect_title(), text: payload });
		} catch (/** @type {any} */ error) {
			if (error?.name !== 'AbortError') failure = error?.message ?? String(error);
		}
	}
</script>

<h1 class="text-3xl font-bold">{m.connect_title()}</h1>
<p class="mt-2 max-w-xl text-muted">{m.connect_intro()}</p>

<!--
	Gated like the studio screens, and for the same reason: a connection is only
	worth anything once this device has an identity other devices can grant
	something to.
-->
<StudioGate>
	<p class="mt-4 font-mono text-sm text-faint" data-testid="own-peer-id">
		{$peerIdStore ?? '…'}
	</p>

	{#if $connectedPeersStore.length > 0}
		<button
			type="button"
			data-testid="hang-up"
			onclick={() => hangUp()}
			class="mt-2 rounded-control border border-border px-3 py-1 text-sm"
		>
			{m.connect_hang_up()}
		</button>
	{/if}

	<p class="mt-1 text-sm" data-testid="connection-status" data-step={step}>
		{#if step === 'connected'}
			<span class="text-success">
				{m.connect_status_connected({ peer: $connectedPeersStore[0] ?? '' })}
			</span>
		{:else if step === 'failed'}
			<span class="text-danger">{m.connect_status_failed({ reason: failure })}</span>
		{:else if step === 'connecting' || step === 'answering'}
			<span class="text-muted">{m.connect_status_connecting()}</span>
		{:else}
			<span class="text-muted">{m.connect_status_idle()}</span>
		{/if}
	</p>

	{#if $joinStore.state !== 'idle'}
		<p class="mt-1 text-sm" data-testid="join-status" data-state={$joinStore.state}>
			{#if $joinStore.state === 'joined'}
				<span class="text-success">{m.join_success({ studio: $joinStore.studioName ?? '' })}</span>
			{:else if $joinStore.state === 'error'}
				<span class="text-danger">{m.join_failed({ reason: $joinStore.error ?? '' })}</span>
			{:else}
				<span class="text-muted">{m.join_busy()}</span>
			{/if}
		</p>
	{/if}

	<div class="mt-6 flex flex-wrap gap-3">
		<button
			type="button"
			data-testid="create-offer"
			disabled={!$signallingStore}
			onclick={createOffer}
			class="rounded-control bg-accent px-4 py-2 font-medium text-accent-contrast disabled:opacity-50"
		>
			{m.connect_create_offer()}
		</button>

		<button
			type="button"
			data-testid="scan-qr"
			disabled={!$signallingStore || scanning}
			onclick={scan}
			class="rounded-control border border-border px-4 py-2"
		>
			{m.connect_scan()}
		</button>
	</div>

	{#if payload}
		<section class="mt-6 rounded-card border border-border bg-surface p-6">
			{#if qrDataUrl}
				<!-- The QR field keeps a light ground in both themes; see tokens.css. -->
				<div class="qr-field inline-block">
					<img src={qrDataUrl} alt={m.connect_scan()} data-testid="qr-image" width="280" />
				</div>
			{:else if qrError}
				<p class="text-sm text-warning" data-testid="qr-too-large">{qrError}</p>
			{/if}

			<label class="mt-4 block text-sm text-muted" for="payload">{m.connect_copy()}</label>
			<textarea
				id="payload"
				data-testid="payload"
				readonly
				rows="4"
				class="mt-1 w-full rounded-control border p-2 font-mono text-xs"
				value={payload}></textarea>

			<div class="mt-3 flex gap-3">
				<button
					type="button"
					data-testid="copy-payload"
					onclick={copy}
					class="rounded-control border border-border px-3 py-1.5 text-sm"
				>
					{copied ? m.connect_copied() : m.connect_copy()}
				</button>
				<button
					type="button"
					data-testid="share-payload"
					onclick={share}
					class="rounded-control border border-border px-3 py-1.5 text-sm"
				>
					{m.connect_share()}
				</button>
			</div>
		</section>
	{/if}

	<section class="mt-6 rounded-card border border-border bg-surface p-6">
		<label class="block text-sm text-muted" for="inbound">
			{step === 'offering' ? m.connect_waiting_answer() : m.connect_paste()}
		</label>
		<textarea
			id="inbound"
			data-testid="inbound-payload"
			rows="4"
			bind:value={inbound}
			class="mt-1 w-full rounded-control border p-2 font-mono text-xs"></textarea>
		<button
			type="button"
			data-testid="submit-inbound"
			disabled={!$signallingStore}
			onclick={() => handleInbound(inbound)}
			class="mt-3 rounded-control border border-border px-3 py-1.5 text-sm disabled:opacity-50"
		>
			{m.connect_paste()}
		</button>
	</section>

	<!-- Kept mounted so the scanner can start without a layout shift; hidden until used. -->
	<div class:hidden={!scanning} class="mt-6">
		<video bind:this={video} data-testid="scanner-video" class="w-full max-w-sm rounded-card"
		></video>
		<canvas bind:this={canvas} class="hidden"></canvas>
		<button
			type="button"
			data-testid="cancel-scan"
			onclick={() => scanAbort?.abort()}
			class="mt-2 rounded-control border border-border px-3 py-1.5 text-sm"
		>
			{m.connect_status_idle()}
		</button>
	</div>
</StudioGate>
