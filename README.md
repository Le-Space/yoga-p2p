# yogasuci

**[Deutsch](README.de.md)** · English

Local-first class booking for yoga studios with more than one location. The
programme, the passes and the check-in run directly between devices — **no
server, no relay, no account**.

Two devices find each other because a person carries a signed code between them:
scanned as a QR code at the front desk, pasted, or sent through a messenger.
After that they replicate directly over WebRTC.

> **Status:** M1–M5 are implemented — registry, programme editor, bookings, cash
> sales, check-in with the courier roundtrip, fork alarm, export and recovery,
> reconciliation and the benchmark suite. The binding plan is
> [`docs/PLAN.md`](docs/PLAN.md) (German); what the design cannot do is
> [`docs/LIMITS.md`](docs/LIMITS.md).

## Getting started

```bash
pnpm install
pnpm dev
```

Node ≥ 22 is enforced (`engine-strict`).

```bash
pnpm test        # vitest (ledger, Node) + Playwright (Chromium)
pnpm check       # types
pnpm lint        # prettier + eslint
pnpm bench       # scaling scenarios, writes bench/report.md
```

## How it works

**The ticket ledger is the core.** Every pass is an append-only log of `issue`,
`redeem` and `void` events, each signed by the device that wrote it. A balance is
never stored, always folded — which is why two locations redeeming the same pass
independently arrive at the same answer without talking to each other.

**The student is the sync courier.** Their device carries their own ledger from
location to location. Because check-in pulls the latest heads _before_ redeeming,
location B sees location A's redemption as soon as the same person turns up —
structurally, with no relay involved.

**The studio keeps the books.** A ticket ledger is created under a shared studio
access controller, so its address follows from the student's DID and the owner's
rather than being handed over. Whoever took the money decides whether a ticket
exists; the student can read their passes and cannot write to them.

**Tampering is made evident, not prevented.** Monotonic `seq` plus
`prevRedeemHash` plus a device signature turn any rolled-back ledger into a
visible fork at the next sync, with both signed events as evidence. An ambiguous
log can cost a unit; it can never hand one out.

Full limits — including what happens behind symmetric NATs without TURN, and what
OrbitDB's whole-database replication means for privacy — in
[`docs/LIMITS.md`](docs/LIMITS.md).

## Layout

```
src/lib/ledger/     pure TypeScript: balance reducer, chain and fork checks
src/lib/db/         OrbitDB stores, access control, reconciliation, export
src/lib/p2p/        libp2p over @le-space/libp2p-webrtc-qr, QR signalling
src/lib/identity/   passkey DID (WebAuthn)
src/lib/styles/     Le-Space design tokens
e2e/                Playwright: alice / carol / bob fixtures
bench/              deterministic scaling scenarios
docs/               PLAN · DESIGN · LIMITS · PRIVACY · TESTING · DEPLOY
```

`src/lib/ledger/` stays free of UI, browser and OrbitDB — the most critical logic
has to be testable without a browser.

## Handbook

The user-facing handbook — for owners, front-desk staff and students, in German
and English — lives in [`docs-site/`](docs-site/), published at
[le-space.github.io/yogasuci](https://le-space.github.io/yogasuci/) and alongside the
app at `/handbuch/`. It
is deliberately separate from `docs/` below, which is the engineering record.

## Documents

The plan and the design notes are written in German; English translations live in
[`docs/en/`](docs/en/) and are listed in [`docs/en/README.md`](docs/en/README.md).
Code comments reference the German paths, which is why those stay where they are.

| File                                 | Contents                                                      |
| ------------------------------------ | ------------------------------------------------------------- |
| [`docs/PLAN.md`](docs/PLAN.md)       | Architecture, data model, milestones — binding                |
| [`docs/DESIGN.md`](docs/DESIGN.md)   | Le-Space tokens with a source per value, measured contrast    |
| [`docs/LIMITS.md`](docs/LIMITS.md)   | Design limits and upstream questions                          |
| [`docs/PRIVACY.md`](docs/PRIVACY.md) | Personal data and metadata, and what encryption does about it |
| [`docs/TESTING.md`](docs/TESTING.md) | Test strategy, real-device checklist                          |
| [`docs/DEPLOY.md`](docs/DEPLOY.md)   | Publishing to Aleph IPFS, DNS, SEO                            |
| [`CLAUDE.md`](CLAUDE.md)             | Conventions for working with Claude Code                      |

## Licence

Apache-2.0 OR MIT
