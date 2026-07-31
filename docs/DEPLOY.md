# DEPLOY.md — Veröffentlichung auf yogasuci.le-space.de

Die App wird als statisches Bundle auf **Aleph IPFS** veröffentlicht und über
eine Custom Domain erreichbar gemacht — dasselbe Verfahren wie bei
`simple-todo.le-space.de`.

Das passt zum Entwurf: Ein statisches Bundle auf einem IPFS-Gateway ist genau
der Verteilweg, den `docs/PLAN.md` §4.2 vorsieht (Installation per Plakat-QR,
kein Server). Das Gateway liefert die App aus — an den Daten hat es keinen
Anteil, die bleiben zwischen den Geräten.

## Ablauf

`.github/workflows/deploy.yml`, ausgelöst durch einen Push auf `main`:

1. `pnpm build` → statisches Bundle in `build/`
2. **`site-publish`** (`@le-space/node`) lädt `build/` nach Aleph IPFS, pinnt es
   und liefert `ipfs_cid` und `item_hash`
3. **`site-domain-link`** verknüpft `yogasuci.le-space.de` mit dieser CID,
   Catch-all auf `/index.html` (Single-Page-App: jeder unbekannte Pfad muss
   `index.html` erreichen, sonst laufen Deep Links ins Leere)

Der Link-Schritt läuft nur, wenn die Store-Message tatsächlich verarbeitet
wurde. Sonst zeigte die Domain auf eine CID, die das Netz noch nicht kennt —
bei grünem Workflow.

## Was noch von Hand passieren muss

Beides kann ich nicht selbst erledigen.

### 1. Secret `ALEPH_PRIVATE_KEY`

Das Repository `Le-Space/yoga-p2p` braucht denselben Aleph-Schlüssel, mit dem
auch `simple-todo` veröffentlicht. Er liegt dort als Repository-Secret; ein
Secret ist nicht auslesbar, es muss also aus der ursprünglichen Quelle neu
gesetzt werden:

```bash
gh secret set ALEPH_PRIVATE_KEY --repo Le-Space/yoga-p2p
```

Alternativ als Organisations-Secret in `Le-Space` anlegen und für dieses
Repository freigeben — dann teilen sich künftige Projekte denselben Eintrag.

### 2. DNS für `yogasuci.le-space.de` — ✅ erledigt

Drei Records, am 2026-08-01 nach der Umbenennung erneut per `dig` verifiziert.
Die alte `yoga.le-space.de` ist entfernt — ein Deploy dorthin liefe ins Leere:

| Name                            | Typ     | Wert                                                    |
| ------------------------------- | ------- | ------------------------------------------------------- |
| `yogasuci.le-space.de`          | `CNAME` | `ipfs.public.aleph.sh.`                                 |
| `_dnslink.yogasuci.le-space.de` | `CNAME` | `_dnslink.yogasuci.le-space.de.static.public.aleph.sh.` |
| `_control.yogasuci.le-space.de` | `TXT`   | `0xD139E44669fD96C714F888B6b04Fe5D02D02B4fD`            |

Was die drei tun:

- **`CNAME`** schickt Besucher auf das öffentliche Aleph-IPFS-Gateway.
- **`_dnslink`** ist die Zuordnung Domain → CID. Aleph pflegt den eigentlichen
  DNSLink-Eintrag auf seiner Seite; der CNAME delegiert ihn dorthin. Ohne
  diesen Record weiß das Gateway zwar, dass es zuständig ist, aber nicht,
  **welchen** Inhalt es ausliefern soll. Genau dieser Record wird bei jedem
  Deploy von `site-domain-link` auf die neue CID gezogen — deshalb ist er die
  Stelle, an der ein Deploy sichtbar wird.
- **`_control`** ist der Eigentumsnachweis: die Aleph-Account-Adresse, die zu
  `ALEPH_PRIVATE_KEY` gehört. Aleph verknüpft die Domain nur, wenn dieser
  Eintrag zur signierenden Adresse passt. Dieselbe Adresse wie bei
  `simple-todo`, weil derselbe Schlüssel verwendet wird — **ein anderer
  Schlüssel bräuchte hier dessen Adresse.**

Nachprüfen:

```bash
dig +short yogasuci.le-space.de CNAME; dig +short _dnslink.yogasuci.le-space.de CNAME; dig +short _control.yogasuci.le-space.de TXT
```

## SEO

- **Metadaten** stehen statisch in `src/app.html`: Titel, Description,
  Canonical, Open Graph, Twitter Card, `theme-color`.
- **`static/og-image.png`** (1200×630) wird aus den Brand-Tokens generiert:
  `node scripts/build-og-image.mjs`. Neu erzeugen, wenn sich Wortlaut oder
  Tokens ändern — nicht von Hand nachzeichnen.
- **`static/robots.txt`** lässt nur die Startseite indexieren.
- **`static/sitemap.xml`** enthält genau diesen einen Eintrag.

### Die Einschränkung, ehrlich benannt

Die App rendert clientseitig (`ssr = false` in `src/routes/+layout.js`). Ein
Crawler sieht damit **nur** den `<head>` aus `app.html` und einen leeren Body —
`<svelte:head>` aus Komponenten landet nicht im vorgerenderten HTML. Folgen:

- Alle Routen liefern denselben Titel und dasselbe Canonical. Deshalb hält
  `robots.txt` den Crawler auf der Startseite; alles andere sind ohnehin
  App-Screens hinter einem Passkey.
- Wer echtes Per-Route-SEO will, muss SSR fürs Prerendering einschalten. Das
  ist nicht kostenlos: `src/lib/p2p/node.js` und die davon abhängigen
  Komponenten würden dann beim Build in Node importiert. Machbar, aber ein
  eigenes Arbeitspaket mit dynamischen Imports — kein Schalter.

Für eine Studio-App ist das der richtige Zuschnitt: Indexiert gehört die
Startseite, nicht der Check-in-Scanner.

## Erster Lauf

Nach Secret und DNS:

```bash
gh workflow run "Build & Deploy to Aleph IPFS" --repo Le-Space/yoga-p2p --ref main
```

Danach kontrollieren:

```bash
curl -sI https://yogasuci.le-space.de/ | head -5
curl -s https://yogasuci.le-space.de/robots.txt
```

DNS-Propagation und das erste Ausrollen des Gateways brauchen erfahrungsgemäß
einige Minuten. Ein 404 unmittelbar nach dem Lauf ist noch kein Fehler — ein
404, der nach einer Stunde bleibt, schon.
