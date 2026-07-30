# docs-site — the user handbook

The handbook for the people who run and attend classes: a studio owner, whoever is
at the front desk, a student with a phone. German and English, both complete.

Deliberately separate from `../docs/`, which is the engineering record — plan,
limits, privacy analysis. Mixing the two leaves both audiences reading past each
other: an owner does not need the OrbitDB access-controller discussion, and a
contributor does not need to be told what a passkey is.

```bash
pnpm install
pnpm start          # dev server, German
pnpm start -- --locale en
pnpm build          # both locales into build/
```

## Styling

`src/css/custom.css` maps Infima onto the Le-Space values, every one of them
copied from `../src/lib/styles/tokens.css`. Nothing is picked by eye here. If a
colour looks wrong it is wrong in the token file, and this is not the place to
patch around it. The light values are the AA-corrected ones — several brand
colours miss WCAG AA for body text, with the measured ratios in `../docs/DESIGN.md`.

## One thing that will bite the next person

**Do not put `"type": "module"` in this package.json.** Docusaurus compiles fine
with it and then dies at prerender with `require.resolveWeak is not a function`,
which reads like a dependency problem and is not one. The config files are `.mjs`
instead, which gets ESM without changing how the server bundle is evaluated.

Two hypotheses were wrong on the way there, and both left workarounds that are now
gone: pnpm's strict `node_modules` layout (a `node-linker=hoisted` `.npmrc`) and
React 19. Neither mattered; both build fine once the module type is right.

## Publishing

Not wired up yet, and it needs a decision rather than a script. The app is a
single-page app at the root of `yoga.le-space.de` with a catch-all onto
`index.html` — a `/handbuch/` path underneath it would be swallowed by that
catch-all before it ever reached these files.

The clean answer is a subdomain of its own (`handbuch.yoga.le-space.de`) published
as a second Aleph site, which needs its own DNS records. Until that exists,
`pnpm build` and a static host is all this needs.
