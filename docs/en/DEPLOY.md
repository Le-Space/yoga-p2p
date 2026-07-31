# DEPLOY.md — publishing to yogasuci.le-space.de

English · **[Deutsch](../DEPLOY.md)**

> Translation of [`docs/DEPLOY.md`](../DEPLOY.md). The German file is the
> original; if the two disagree, believe that one.

The app is published as a static bundle on **Aleph IPFS** and reached through a
custom domain — the same route as `simple-todo.le-space.de`.

It fits the design: a static bundle on an IPFS gateway is exactly the
distribution path `docs/PLAN.md` §4.2 assumes (installed from a QR code on a
poster, no server). The gateway serves the app; it has no part in the data, which
stays between the devices.

## The flow

`.github/workflows/deploy.yml`, triggered by a push to `main`:

1. `pnpm build` → static bundle in `build/`
2. **`site-publish`** (`@le-space/node`) uploads `build/` to Aleph IPFS, pins it
   and returns `ipfs_cid` and `item_hash`
3. **`site-domain-link`** ties `yogasuci.le-space.de` to that CID, with a catch-all
   onto `/index.html` (single-page app: every unknown path has to reach
   `index.html`, or deep links go nowhere)

The link step only runs once the store message has actually been processed.
Otherwise the domain pointed at a CID the network did not know yet — with a green
workflow.

## What still has to happen by hand

Neither of these can be done from inside the repository.

### 1. The `ALEPH_PRIVATE_KEY` secret

`Le-Space/yogasuci` needs the same Aleph key that publishes `simple-todo`. It
lives there as a repository secret, and a secret cannot be read back — so it has
to be set again from the original source:

```bash
gh secret set ALEPH_PRIVATE_KEY --repo Le-Space/yogasuci
```

Or as an organisation secret in `Le-Space`, released to this repository, so
future projects share one entry.

### 2. DNS for `yogasuci.le-space.de` — ✅ done

Three records, verified with `dig` again on 2026-08-01 after the rename. The old
`yoga.le-space.de` is gone — a deploy there would go nowhere:

| Name                            | Type    | Value                                                   |
| ------------------------------- | ------- | ------------------------------------------------------- |
| `yogasuci.le-space.de`          | `CNAME` | `ipfs.public.aleph.sh.`                                 |
| `_dnslink.yogasuci.le-space.de` | `CNAME` | `_dnslink.yogasuci.le-space.de.static.public.aleph.sh.` |
| `_control.yogasuci.le-space.de` | `TXT`   | `0xD139E44669fD96C714F888B6b04Fe5D02D02B4fD`            |

What each does:

- **`CNAME`** sends visitors to the public Aleph IPFS gateway.
- **`_dnslink`** is the domain → CID mapping. Aleph maintains the actual DNSLink
  record on its side; the CNAME delegates to it. Without this record the gateway
  knows it is responsible but not **which** content to serve. It is the record
  `site-domain-link` moves to the new CID on every deploy, which makes it the
  place where a deploy becomes visible.
- **`_control`** is the proof of ownership: the Aleph account address belonging
  to `ALEPH_PRIVATE_KEY`. Aleph only links the domain when this entry matches the
  signing address. The same address as `simple-todo`, because it is the same key
  — **a different key would need its address here.**

To check:

```bash
dig +short yogasuci.le-space.de CNAME; dig +short _dnslink.yogasuci.le-space.de CNAME; dig +short _control.yogasuci.le-space.de TXT
```

## SEO

- **Metadata** sits statically in `src/app.html`: title, description, canonical,
  Open Graph, Twitter card, `theme-color`.
- **`static/og-image.png`** (1200×630) is generated from the brand tokens:
  `node scripts/build-og-image.mjs`. Regenerate it when the wording or the tokens
  change — do not redraw it by hand.
- **`static/robots.txt`** allows only the start page to be indexed.
- **`static/sitemap.xml`** contains exactly that one entry.

### The limitation, stated plainly

The app renders client-side (`ssr = false` in `src/routes/+layout.js`). A crawler
therefore sees **only** the `<head>` from `app.html` and an empty body —
`<svelte:head>` from components does not reach the prerendered HTML. Consequences:

- Every route serves the same title and the same canonical. That is why
  `robots.txt` keeps the crawler on the start page; everything else is an app
  screen behind a passkey anyway.
- Real per-route SEO needs SSR for prerendering. That is not free:
  `src/lib/p2p/node.js` and everything depending on it would then be imported in
  Node at build time. Doable, but a work package of its own with dynamic imports
  — not a switch.

For a studio app this is the right cut: the start page belongs in an index, the
check-in scanner does not.

## First run

Once the secret and DNS are in place:

```bash
gh workflow run "Build & Deploy to Aleph IPFS" --repo Le-Space/yogasuci --ref main
```

Then check:

```bash
curl -sI https://yogasuci.le-space.de/ | head -5
curl -s https://yogasuci.le-space.de/robots.txt
```

DNS propagation and the gateway's first rollout take a few minutes in practice. A
404 straight after the run is not yet a failure; a 404 that is still there an hour
later is.
