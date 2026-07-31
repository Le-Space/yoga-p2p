---
title: What is still to come
sidebar_position: 40
---

# What is still to come

This page is deliberately careful in its wording. What is here is planned or
considered — not promised. What the app can do **today** is in the chapters before
it; what it cannot do is under [What the app cannot
do](/what-it-cannot-do).

## Backup on decentralised storage

Today your backup lives wherever you put it: **Export** downloads a file, and where
it lands is your decision. Without a server there is no alternative — there is
nobody for it to live with.

That works, but it has an uncomfortable edge. If **all** of a studio's devices are
lost at once — theft, fire, water — then only what somebody exported and put
somewhere still exists.

So the plan is an **optional** backup on decentralised storage, for instance over
**Filecoin**. Optional in a strict sense: a studio that does not want it loses no
function. A studio that switches it on gets a copy that survives losing every
device.

### What it is waiting on

A module for this already exists:
[`orbitdb-storacha-bridge`](https://github.com/NiKrause/orbitdb-storacha-bridge).
It takes an OrbitDB database apart into its blocks — log entries, manifest,
identities, access control — uploads them individually, and on restore reassembles
them so that the original identity is preserved. That last part is the hard one: a
backup that loses the identity gives you a database whose older entries nobody can
verify any more.

The catch: the module uploads through **Storacha's** infrastructure, and Storacha
no longer exists as a company. It has to be moved to a different provider before it
can be used here. That is work at a known place rather than an open design question
— but it is done when it is done, which is why no date is given.

### What has to be thought through

A copy on somebody else's storage raises exactly the questions this app otherwise
does not have, and they need answering before it is built:

- **Who can read it?** An unencrypted backup on public storage would be the
  opposite of what this app is for. Encryption is not a garnish here but a
  precondition — and unlike the shared databases it is straightforward, because
  there is exactly **one** reader: the studio (see the account in
  `docs/PRIVACY.md`).
- **What happens to an erasure request?** What is on distributed storage cannot be
  called back. The workable route is to destroy the key rather than the data, which
  presupposes encrypting from the start.
- **Does it change the data protection relationship?** Today nobody but you
  processes anything. A storage provider would be a third party — and then the
  question of a data processing agreement arises, which at present explicitly does
  not. That needs settling before the switch exists.

## What else is open

- **Series tickets for single dates.** A series can be booked; selling a single
  class out of one is still missing.
- **A privacy notice for students.** A template a studio can adapt and hand over —
  you are the controller, not us.
- **Erasure.** The logs are append-only. What that means for an erasure request is
  open, and is not talked around.

The full technical picture is in the
[repository](https://github.com/Le-Space/yoga-p2p) — including everything too small
for a chapter of its own here.
