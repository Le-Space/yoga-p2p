<script>
	/**
	 * Registry editor: the studio, its locations and its devices
	 * (docs/PLAN.md §3.1, §9 "Inhaberin").
	 *
	 * Nothing here deletes. A location or device that ever appeared on a signed
	 * ticket event stays in the registry — deactivated or revoked — because the
	 * ledger verifies old events against it and the cash report is grouped by it.
	 */
	import StudioGate from '$lib/components/StudioGate.svelte';
	import {
		deactivateLocation,
		devicesStore,
		locationsStore,
		registerDevice,
		revokeDevice,
		saveLocation,
		saveStudio,
		studioStore
	} from '$lib/db/registry.js';
	import { localized } from '$lib/db/program.js';
	import { forgetPendingDevice, pendingDevicesStore } from '$lib/db/join.js';
	import { ownDidStore } from '$lib/p2p/node.js';
	import { getLocale } from '$lib/paraglide/runtime.js';
	import * as m from '$lib/paraglide/messages.js';

	let studioName = $state('');
	let error = $state('');

	let location = $state({ id: '', nameDe: '', nameEn: '', address: '' });

	const ROLES = [
		{ value: 'front-desk', label: () => m.pending_device_role_frontdesk() },
		{ value: 'teacher', label: () => m.pending_device_role_teacher() },
		{ value: 'owner', label: () => m.pending_device_role_owner() }
	];

	/**
	 * Per-device form state, keyed by DID.
	 *
	 * Seeded in an effect rather than on demand from the template: Svelte cannot
	 * bind to a function call, so each draft has to exist as a plain property
	 * before the form renders.
	 */
	let drafts = $state(
		/** @type {Record<string, { role: string, locationId: string, label: string }>} */ ({})
	);

	$effect(() => {
		for (const did of $pendingDevicesStore.keys()) {
			if (!drafts[did]) drafts[did] = { role: 'front-desk', locationId: '', label: '' };
		}
	});

	/** @param {{ did: string, label: string, publicKey?: string }} device */
	async function approve(device) {
		const draft = drafts[device.did];

		await run(async () => {
			await registerDevice({
				deviceDid: device.did,
				role: /** @type {any} */ (draft.role),
				locationId: draft.locationId,
				// Without it the ledger cannot verify anything this device signs.
				publicKey: device.publicKey ?? '',
				// Falls back to what the device reported about itself, trimmed.
				label: draft.label || device.label || device.did.slice(-8)
			});
			forgetPendingDevice(device.did);
		});
	}

	// The studio document arrives asynchronously; seed the field once it does,
	// without clobbering what the user is typing.
	let seeded = false;
	$effect(() => {
		if (!seeded && $studioStore?.name) {
			studioName = $studioStore.name;
			seeded = true;
		}
	});

	/** @param {() => Promise<void>} action */
	async function run(action) {
		error = '';
		try {
			await action();
		} catch (/** @type {any} */ cause) {
			error = cause?.message ?? String(cause);
		}
	}

	async function submitStudio(/** @type {SubmitEvent} */ event) {
		event.preventDefault();
		await run(() => saveStudio({ name: studioName }));
	}

	async function submitLocation(/** @type {SubmitEvent} */ event) {
		event.preventDefault();
		await run(async () => {
			await saveLocation({
				id: location.id,
				name: { de: location.nameDe, en: location.nameEn || location.nameDe },
				address: location.address
			});
			location = { id: '', nameDe: '', nameEn: '', address: '' };
		});
	}
</script>

<h1 class="text-3xl font-bold">{m.studio_title()}</h1>

<StudioGate>
	{#if error}
		<p class="mt-4 text-danger" role="alert" data-testid="studio-error">
			{m.error_generic({ reason: error })}
		</p>
	{/if}

	<section class="mt-6 rounded-card border border-border bg-surface p-6">
		<h2 class="eyebrow">{m.studio_title()}</h2>

		<form class="mt-3 grid max-w-md gap-3" onsubmit={submitStudio}>
			<label class="grid gap-1 text-sm">
				{m.studio_name()}
				<input
					data-testid="studio-name"
					bind:value={studioName}
					required
					class="rounded-control border p-2"
				/>
			</label>
			<button
				type="submit"
				data-testid="studio-save"
				class="justify-self-start rounded-control bg-accent px-4 py-2 font-medium text-accent-contrast"
			>
				{m.studio_save()}
			</button>
		</form>

		<p class="mt-3 font-mono text-xs break-all text-faint" data-testid="owner-did">
			{m.studio_owner()}: {$studioStore?.ownerDid ?? $ownDidStore ?? '…'}
		</p>
	</section>

	<section class="mt-6 rounded-card border border-border bg-surface p-6">
		<h2 class="eyebrow">{m.locations_title()}</h2>

		<ul class="mt-3 grid gap-2" data-testid="location-list">
			{#each $locationsStore as entry (entry._id)}
				<li
					class="flex items-baseline gap-3 border-b border-border pb-2"
					data-testid="location-item"
					data-location-id={entry._id}
					data-active={entry.active}
				>
					<span class="flex-1">
						{localized(entry.name, getLocale())}
						{#if !entry.active}
							<span class="text-faint">· {m.location_inactive()}</span>
						{/if}
					</span>
					{#if entry.active}
						<button
							type="button"
							data-testid="location-deactivate"
							onclick={() => run(() => deactivateLocation(entry._id))}
							class="rounded-control border border-border px-2 py-1 text-sm"
						>
							{m.location_deactivate()}
						</button>
					{/if}
				</li>
			{:else}
				<li class="text-faint" data-testid="location-empty">{m.location_none()}</li>
			{/each}
		</ul>

		<form class="mt-4 grid max-w-md gap-3" onsubmit={submitLocation}>
			<label class="grid gap-1 text-sm">
				{m.location_id()}
				<input
					data-testid="location-id"
					bind:value={location.id}
					required
					pattern="[a-z0-9-]+"
					class="rounded-control border p-2"
				/>
			</label>
			<label class="grid gap-1 text-sm">
				{m.location_name_de()}
				<input
					data-testid="location-name-de"
					bind:value={location.nameDe}
					required
					class="rounded-control border p-2"
				/>
			</label>
			<label class="grid gap-1 text-sm">
				{m.location_name_en()}
				<input
					data-testid="location-name-en"
					bind:value={location.nameEn}
					class="rounded-control border p-2"
				/>
			</label>
			<label class="grid gap-1 text-sm">
				{m.location_address()}
				<input
					data-testid="location-address"
					bind:value={location.address}
					class="rounded-control border p-2"
				/>
			</label>
			<button
				type="submit"
				data-testid="location-add"
				class="justify-self-start rounded-control border border-border px-4 py-2"
			>
				{m.location_add()}
			</button>
		</form>
	</section>

	<section class="mt-6 rounded-card border border-border bg-surface p-6">
		<h2 class="eyebrow">{m.pending_devices_title()}</h2>

		{#each [...$pendingDevicesStore.values()].filter((d) => drafts[d.did]) as device (device.did)}
			<form
				class="mt-4 grid max-w-lg gap-3 border-b border-border pb-4"
				data-testid="pending-device"
				data-device-did={device.did}
				onsubmit={(event) => {
					event.preventDefault();
					approve(device);
				}}
			>
				<p class="font-mono text-xs break-all text-faint">{device.did}</p>

				<div class="grid grid-cols-2 gap-3">
					<label class="grid gap-1 text-sm">
						{m.pending_device_role()}
						<select
							data-testid="pending-device-role"
							bind:value={drafts[device.did].role}
							class="rounded-control border p-2"
						>
							{#each ROLES as role (role.value)}
								<option value={role.value}>{role.label()}</option>
							{/each}
						</select>
					</label>

					<label class="grid gap-1 text-sm">
						{m.pending_device_location()}
						<select
							data-testid="pending-device-location"
							bind:value={drafts[device.did].locationId}
							required
							class="rounded-control border p-2"
						>
							<option value="" disabled></option>
							{#each $locationsStore.filter((entry) => entry.active) as entry (entry._id)}
								<option value={entry._id}>{localized(entry.name, getLocale())}</option>
							{/each}
						</select>
					</label>
				</div>

				<label class="grid gap-1 text-sm">
					{m.pending_device_label()}
					<input
						data-testid="pending-device-label"
						bind:value={drafts[device.did].label}
						class="rounded-control border p-2"
					/>
					<span class="text-xs text-faint">{m.pending_device_hint()}</span>
				</label>

				<button
					type="submit"
					data-testid="pending-device-register"
					class="justify-self-start rounded-control bg-accent px-4 py-2 font-medium text-accent-contrast"
				>
					{m.pending_device_register()}
				</button>
			</form>
		{:else}
			<p class="mt-3 text-faint" data-testid="pending-devices-empty">{m.pending_devices_none()}</p>
		{/each}
	</section>

	<section class="mt-6 rounded-card border border-border bg-surface p-6">
		<h2 class="eyebrow">{m.devices_title()}</h2>

		<ul class="mt-3 grid gap-2" data-testid="device-list">
			{#each $devicesStore as device (device._id)}
				<li
					class="flex items-baseline gap-3 border-b border-border pb-2"
					data-testid="device-item"
					data-device-did={device.deviceDid}
					data-revoked={Boolean(device.revokedAt)}
				>
					<span class="flex-1">
						{device.label}
						<span class="text-faint">· {device.role} · {device.locationId}</span>
						{#if device.revokedAt}
							<span class="text-danger">· {m.device_revoked()}</span>
						{/if}
					</span>
					{#if !device.revokedAt}
						<button
							type="button"
							data-testid="device-revoke"
							onclick={() => run(() => revokeDevice(device.deviceDid))}
							class="rounded-control border border-border px-2 py-1 text-sm"
						>
							{m.device_revoke()}
						</button>
					{/if}
				</li>
			{:else}
				<!-- Pairing is M2 (T2.3); until then this list is empty by design. -->
				<li class="text-faint" data-testid="device-empty">{m.device_none()}</li>
			{/each}
		</ul>
	</section>
</StudioGate>
