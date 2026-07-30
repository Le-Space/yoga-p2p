<script>
	/**
	 * Wraps any screen that needs an identity and open databases.
	 *
	 * On load it restores a known passkey silently — a reload must not cost a
	 * WebAuthn interaction. Only a device with no passkey at all sees the
	 * onboarding form.
	 */
	import { onMount } from 'svelte';
	import {
		bootStore,
		bootIfIdentityKnown,
		createIdentityAndBoot,
		hasIdentity,
		recoverIdentityAndBoot,
		studioReady
	} from '$lib/identity/onboarding.js';
	import { ownDidStore } from '$lib/p2p/node.js';
	import * as m from '$lib/paraglide/messages.js';

	let { children } = $props();

	let userId = $state('');
	let displayName = $state('');
	let knownIdentity = $state(false);

	onMount(async () => {
		knownIdentity = hasIdentity();
		try {
			await bootIfIdentityKnown();
		} catch {
			// The error is already in bootStore; the form below offers a retry.
		}
	});

	async function create(/** @type {SubmitEvent} */ event) {
		event.preventDefault();
		try {
			await createIdentityAndBoot({ userId, displayName });
		} catch {
			// surfaced through bootStore
		}
	}

	async function recover() {
		try {
			await recoverIdentityAndBoot();
		} catch {
			// surfaced through bootStore
		}
	}
</script>

{#if $studioReady}
	<div data-testid="studio-ready" data-did={$ownDidStore}>
		{@render children?.()}
	</div>
{:else}
	<section class="rounded-card border border-border bg-surface p-6" data-testid="onboarding">
		<h2 class="eyebrow">{m.onboarding_title()}</h2>

		{#if $bootStore.state === 'starting'}
			<p class="mt-3 text-muted" data-testid="onboarding-busy">{m.onboarding_busy()}</p>
		{:else}
			<p class="mt-3 max-w-xl text-muted">{m.onboarding_intro()}</p>

			{#if $bootStore.state === 'error'}
				<p class="mt-3 text-danger" data-testid="onboarding-error" role="alert">
					{m.error_generic({ reason: $bootStore.error ?? '' })}
				</p>
			{/if}

			<!--
				Recovering is offered unconditionally, and that was a real gap: it used to
				appear only when local storage still remembered a credential — which is
				never true on the device somebody reaches for *after* losing the last one.
				A passkey lives in the authenticator and can be synced or carried, so the
				new phone has to be allowed to ask. It costs one WebAuthn prompt and fails
				with a plain "No passkey found on this device."
			-->
			<button
				type="button"
				data-testid="recover-identity"
				onclick={recover}
				class="mt-4 rounded-control bg-accent px-4 py-2 font-medium text-accent-contrast"
			>
				{m.onboarding_recover()}
			</button>

			{#if !knownIdentity}
				<form class="mt-4 grid max-w-md gap-3" onsubmit={create}>
					<label class="grid gap-1 text-sm">
						{m.onboarding_user_id()}
						<input
							data-testid="onboarding-user-id"
							bind:value={userId}
							required
							autocomplete="username"
							class="rounded-control border p-2"
						/>
					</label>

					<label class="grid gap-1 text-sm">
						{m.onboarding_display_name()}
						<input
							data-testid="onboarding-display-name"
							bind:value={displayName}
							required
							class="rounded-control border p-2"
						/>
					</label>

					<button
						type="submit"
						data-testid="onboarding-submit"
						class="justify-self-start rounded-control bg-accent px-4 py-2 font-medium text-accent-contrast"
					>
						{m.onboarding_create()}
					</button>
				</form>

				<!--
					§6.2: losing the owner device costs the studio its ability to
					register or revoke anything. The wizard has to ask for a second
					owner device up front, not after the first loss.
				-->
				<p class="mt-4 max-w-xl text-sm text-warning" data-testid="second-device-reminder">
					{m.onboarding_second_device()}
				</p>
			{/if}
		{/if}
	</section>
{/if}
