# Repro: the WebAuthn identity document changes on every page load

Minimal reproduction for `@le-space/orbitdb-identity-provider-webauthn-did`
(measured against `0.3.1`, `@orbitdb/core@4.x`).

## What happens

A passkey-backed OrbitDB identity keeps its DID and its public key across page
loads, but the **identity document** is content-addressed to a different hash
every time.

```
load 1: hash=zdpuAsgNjpRxvCTXcGzH9q5NDueeqe34gARihneQakeQnZbgy
load 2: hash=zdpuAvmfNLkHnVNnH9Js5ERvYsN3EjZ6u6XCFUxJpwdDiQ8of
load 3: hash=zdpuAmLf1K13f41RcR7yMozUKjQnAErksdHuAs6jHg6joMqZM

distinct DIDs over 3 loads:              1  (stable)
distinct public keys over 3 loads:       1  (stable)
distinct identity hashes over 3 loads:   3  (UNSTABLE)

field stability:
  id                     1 distinct (stable)
  publicKey              1 distinct (stable)
  type                   1 distinct (stable)
  signatures.id          1 distinct (stable)
  signatures.publicKey   3 distinct (UNSTABLE)
```

`signatures.publicKey` is the only field that moves.

## Why it matters

Every OrbitDB entry references, by hash, the identity document that signed it.
A peer validating that entry calls `identities.getIdentity(entry.identity)` and
has to resolve **that exact document**. When it cannot, `canAppend` returns
false and OrbitDB drops the entry — permanently, with no retry, and the only
trace is:

```
Could not append entry:
Key "<hash>" is not allowed to write to the log
```

So a device that reloads writes history under a document that other devices may
never be able to resolve. Observed downstream as a database that replicates
some entries and silently never receives the rest, with a healthy mesh,
subscribed topics, paired sync peers and no error anywhere.

## Cause

`Identities.createIdentity` re-signs on every call and has no cache:

```js
// @orbitdb/core/src/identities/identities.js
const idSignature = await signMessage(privateKey, id);
const publicKeyAndIdSignature = await identityProvider.signIdentity(
	publicKey + idSignature,
	options
);
```

For this provider, `signIdentity` produces a **live WebAuthn assertion**. An
assertion embeds a fresh challenge and an incremented signature counter, and
ECDSA signing is randomised — so it is different every time by construction. A
document containing one can never be stably content-addressed.

This is a design mismatch rather than a coding slip: content addressing needs
determinism, WebAuthn assertions are deliberately non-deterministic.

## Suggested directions

1. **Do not embed the assertion.** Derive a keypair from the passkey (PRF) and
   sign the identity with it deterministically. The assertion then only unlocks
   the key and never enters the document.
2. **Or create the document once** and reuse it: `createIdentity` could look up
   an existing identity for the id before signing a new one.

Either fixes it upstream for every consumer. Downstream, the second can be
approximated by remembering the first document's hash and reusing it — see
`stableIdentity()` in `src/lib/p2p/node.js` of this repository. That relies on a
persistent blockstore, which is why this repro (in-memory Helia) does not
include it.

## Running it

From the repository root:

```bash
node repro/webauthn-identity-stability/run.mjs
node repro/webauthn-identity-stability/run.mjs --encryptKeystore=false
```

Starts Vite, opens Chromium with a CDP virtual authenticator, loads the page
three times and compares the identities. Exits non-zero while the hash is
unstable — so it doubles as a regression check once the upstream fix lands.

Files: `app.js` is the whole reproduction (a passkey, a Helia node, one
identity); `run.mjs` drives it; `index.html` and `vite.config.js` exist only to
serve it.
