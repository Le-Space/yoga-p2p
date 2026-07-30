---
title: Devices
sidebar_position: 2
---

# Approving and revoking devices

Every device that is to sell or check in has to be approved by the owner. That
applies to the iPad at the second location as much as to a stand-in's phone.

## Approving

1. Both devices open **Connect**.
2. One creates a code, the other scans or pastes it — see [Connecting](/connecting).
3. On the owner's device the new one appears under **Registry** as waiting.
4. Choose a role and a location, approve.

From that moment the device may sell and redeem passes. It appears in the device
list every other device receives too — that is how they all know whose signature
counts.

## Revoking

A device is never deleted, it is **revoked**, with a timestamp.

That matters more than it sounds: everything the device signed **before** the
revocation stays valid. A day of legitimately sold passes does not become void
because the device goes missing later. Everything after is refused.

<div class="no-server">

**A revocation needs a meeting**
A revoked device only learns about it the next time it meets another device. Until
then it can keep signing — and those entries are refused later, once the
revocation arrives. So for a lost device: revoke it, and expect a few entries to
trail in.

</div>

## Roles

| Role           | May                                                  |
| -------------- | ---------------------------------------------------- |
| **Owner**      | everything, including approving and revoking devices |
| **Front desk** | sell, check in, confirm bookings                     |
| **Teacher**    | the same as front desk, meant for those teaching     |

Only the owner can change the registry itself. A front-desk device that could
change it could enter itself.
