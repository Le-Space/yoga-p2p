---
title: What the app cannot do
sidebar_position: 20
---

# What the app cannot do

More honest than leaving it out. None of this is a fault waiting to be fixed —
these are the other side of working without a server.

## Double redemption is detectable, not preventable

Two counters without a connection can redeem the same class. Without a central
machine to ask both, there is no other way.

What the app does instead: it **shows** the contradiction once the entries come
together, with both records. The balance is charged exactly once — a contradiction
never gives a class away and never costs two.

The damage per incident is one yoga class. In exchange there is no server.

## Whoever knows an address can read along

The underlying database has **write** permissions but no read permissions. Anyone
who knows a database's address and can reach a device holding it can read it in
full.

In practice: your pass accounts live with you and on your studio's devices, and
none of those addresses is distributed. But that is a matter of distribution, not
an enforced barrier.

Spelled out in full in the
[privacy analysis](https://github.com/Le-Space/yogasuci/blob/main/docs/PRIVACY.md).

## Nothing on the device is encrypted

Anyone who picks up an **unlocked** studio device reads everything on it. No
passkey needed.

For the iPad at the front desk that is the realistic way to get at data — not the
network. A lock screen and device encryption matter more here than anything the
app could do.

## Some connections do not come together over a distance

Some internet connections do not let two devices reach each other directly. There
are helper servers for that; the app deliberately uses none, because they would
see the traffic. In the studio, on the same network, the case does not arise.

## No deletion in the real sense

Entries are appended, never overwritten — which is why the numbers add up. A pass
can be voided, but its history stays readable.

So there is no finished procedure for a GDPR erasure request yet. That is open,
and recorded as open in the repository.

## There is nobody to fall back on

No provider, no password reset, no recovery. Which is why:

- a **second device** in the studio, from the start
- **export** regularly
- keep passkeys where they are synchronised
