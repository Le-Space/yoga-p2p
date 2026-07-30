# TESTING.md

English · **[Deutsch](../TESTING.md)**

> Translation of [`docs/TESTING.md`](../TESTING.md). The German file is the one
> code comments point at, so it stays where it is; if the two ever disagree, the
> German one is the original.

## What runs where

| Command          | Scope                                                                  |
| ---------------- | ---------------------------------------------------------------------- |
| `pnpm test:unit` | vitest in **Node** — the ledger. No browser, no network dependency.    |
| `pnpm test:e2e`  | Playwright, Chromium. Builds the app and serves it via `vite preview`. |
| `pnpm test`      | both                                                                   |
| `pnpm check`     | svelte-check against `jsconfig.json`                                   |
| `pnpm lint`      | prettier + eslint                                                      |
| `pnpm bench`     | scaling scenarios in Node, writes `bench/report.md`                    |

## The handshake in tests

`connectViaPaste(offerer, answerer)` from `e2e/fixtures.js` drives all three
steps: create an offer → paste it into the second context → carry the answer
back. It is the default for most tests because it runs the same signalling as the
QR path without the video decoding, which means a failure is never ambiguous.

Every connection test runs with `?ice=host`: no STUN lookup, no dependency on the
CI runner's network, a deterministic candidate set.

`connectViaCamera(offerer)` drives the same handshake through the **camera**: the
offer is rendered as a QR video and fed to the answering browser as a webcam. The
app's own decoder therefore runs against a real `MediaStream` — the difference
between testing the scan path and testing a mock of it, and the scan path is the
one used at the front desk.

Two quirks that explain the setup:

- The fake camera is a **launch flag**, not a context option. The answering side
  gets its own browser, and the video file has to exist before it starts.
- The `.y4m` is produced in `e2e/qr-video.js` in plain Node from the QR module
  matrix that `qrcode` hands over anyway — **not** through ffmpeg. ffmpeg is
  installed here and on GitHub's runners, but an unstated system binary is
  exactly the dependency that breaks on somebody else's machine.

When a payload does not fit into a scannable code, the helper says so explicitly
(`docs/LIMITS.md` §1.6) instead of failing somewhere inside the decoder.

## Identity

`e2e/webauthn.js` attaches a CDP virtual authenticator to the browser context.
`hasLargeBlob: true` is not a detail — without it the recovery path silently
falls back to local storage and stops being tested.

There is **no** test or bypass mode in the identity provider, and there must
never be one. The emulator is the seam.

## Language

The language follows the device. A test that expects one sets it explicitly via
`browser.newContext({ locale })` — never by assumption. Selectors are
`data-testid` only, so the same spec runs in both languages.

## a11y

`e2e/a11y.spec.js` runs axe over every screen in both themes. The assertion
compares a compact projection of the violations, so a contrast failure shows
immediately which token is to blame instead of hundreds of lines of raw output.

A contrast failure is fixed with a derived token and documented in
`docs/DESIGN.md` — never by excluding the rule.

## Real-device checklist

What emulation does not cover, and what to check by hand before a studio uses
this:

- **Scan distance and focus:** an offer QR on a phone display, scanned from a
  tablet at roughly 20–30 cm. Autofocus takes a moment on some tablets.
- **Display brightness:** the QR stays on a light field in both themes
  (`.qr-field`), but a heavily dimmed display still scans badly.
- **Rear camera:** the app asks for `facingMode: environment`. On devices without
  one the browser falls back to the front camera — which is fine, but the user
  sees themselves and needs to be told why.
- **Camera permission denied:** the copy-and-paste path has to stay reachable
  without a reload.
- **Symmetric NAT:** the remote path can fail without TURN (`docs/LIMITS.md`
  §1.2). The assistant has to say so rather than spin forever.

## Only checkable on real hardware

- **largeBlob recovery.** Register a passkey on device A, install the app on
  device B under the same platform account, choose "continue with the existing
  passkey" — the same DID has to appear. The CDP virtual authenticator cannot
  model this (`docs/LIMITS.md` §2.5), so this one falls back to a real pair of
  devices. Until somebody confirms it once, the path counts as unproven.
