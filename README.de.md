# yoga-p2p

Deutsch · **[English](README.md)**

Local-first Kursbuchung für Yogastudios mit mehreren Standorten. Programm,
Karten und Check-in laufen direkt zwischen den Geräten — **kein Server, kein
Relay, kein Konto**.

Zwei Geräte finden zueinander, indem ein Mensch einen signierten Code trägt: per
QR-Scan an der Rezeption, per Copy & Paste oder über einen Messenger. Danach
replizieren sie direkt über WebRTC.

> **Stand:** M1–M5 sind umgesetzt — Registry, Programm-Editor, Buchungen,
> Barverkauf, Check-in mit Kurier-Rundlauf, Fork-Alarm, Export und Recovery,
> Abgleich und Benchmark-Suite. Verbindlich ist [`docs/PLAN.md`](docs/PLAN.md);
> was der Entwurf nicht kann, steht in [`docs/LIMITS.md`](docs/LIMITS.md).

## Loslegen

```bash
pnpm install
pnpm dev
```

Node ≥ 22 wird erzwungen (`engine-strict`).

```bash
pnpm test        # vitest (Ledger, Node) + Playwright (Chromium)
pnpm check       # Typen
pnpm lint        # prettier + eslint
pnpm bench       # Skalierungsszenarien, schreibt bench/report.md
```

## Wie es funktioniert

**Der Ticket-Ledger ist der Kern.** Jede Karte ist ein append-only Log aus
`issue`-, `redeem`- und `void`-Events, jedes signiert vom Gerät, das es
geschrieben hat. Ein Guthaben wird nie gespeichert, immer gefaltet — deshalb
kommen zwei Standorte, die dieselbe Karte unabhängig entwerten, ohne Abstimmung
zum selben Ergebnis.

**Der Schüler ist der Sync-Kurier.** Sein Gerät trägt seinen eigenen Ledger von
Standort zu Standort. Weil der Check-in die neuesten Stände _vor_ dem Entwerten
zieht, sieht Standort B die Entwertung von Standort A, sobald dieselbe Person
auftaucht — strukturell, ohne Relay.

**Das Studio führt das Buch.** Ein Ticket-Ledger entsteht unter einem gemeinsamen
Studio-Access-Controller; seine Adresse folgt damit aus der DID des Schülers und
der der Inhaberin, statt übergeben zu werden. Wer die Zahlung erhalten hat,
entscheidet über das Ticket — der Schüler kann seine Karten lesen und nicht
beschreiben.

**Manipulation wird nachweisbar, nicht verhindert.** Monotone `seq` +
`prevRedeemHash` + Gerätesignatur machen jeden zurückgesetzten Ledger beim
nächsten Sync als Fork sichtbar, mit beiden signierten Events als Beleg. Ein
mehrdeutiger Log kann eine Einheit kosten, aber nie eine verschenken.

Vollständige Grenzen — inklusive der Frage, was ohne TURN bei symmetrischen NATs
passiert und was OrbitDBs Voll-Replikation für die Privatsphäre bedeutet — in
[`docs/LIMITS.md`](docs/LIMITS.md).

## Aufbau

```
src/lib/ledger/     reines TypeScript: Guthaben-Reducer, Ketten- und Fork-Prüfung
src/lib/db/         OrbitDB-Stores, Zugriffsrechte, Abgleich, Export
src/lib/p2p/        libp2p über @le-space/libp2p-webrtc-qr, QR-Signalisierung
src/lib/identity/   Passkey-DID (WebAuthn)
src/lib/styles/     Le-Space-Design-Tokens
e2e/                Playwright: Fixtures alice / carol / bob
bench/              deterministische Skalierungsszenarien
docs/               PLAN · DESIGN · LIMITS · PRIVACY · TESTING · DEPLOY
```

`src/lib/ledger/` bleibt frei von UI, Browser und OrbitDB — die kritischste Logik
muss ohne Browser testbar sein.

## Handbuch

Die Anwenderdokumentation — für Inhaberinnen, Theke und Schüler, deutsch und
englisch — liegt in [`docs-site/`](docs-site/) und wird mit Docusaurus gebaut. Sie
ist bewusst getrennt von `docs/` weiter unten, das die technische Aufzeichnung ist.

## Dokumente

Plan und Entwurfsnotizen sind auf Deutsch; die englischen Übersetzungen liegen in
[`docs/en/`](docs/en/). Code-Kommentare verweisen auf die deutschen Pfade,
deshalb bleiben diese, wo sie sind.

| Datei                                | Inhalt                                                            |
| ------------------------------------ | ----------------------------------------------------------------- |
| [`docs/PLAN.md`](docs/PLAN.md)       | Architektur, Datenmodell, Meilensteine — verbindlich              |
| [`docs/DESIGN.md`](docs/DESIGN.md)   | Le-Space-Tokens mit Quelle je Wert, Kontrast-Messwerte            |
| [`docs/LIMITS.md`](docs/LIMITS.md)   | Entwurfsgrenzen und Upstream-Fragen                               |
| [`docs/PRIVACY.md`](docs/PRIVACY.md) | Personenbezogene Daten und Metadaten, Wirkung von Verschlüsselung |
| [`docs/TESTING.md`](docs/TESTING.md) | Teststrategie, Checkliste für echte Geräte                        |
| [`docs/DEPLOY.md`](docs/DEPLOY.md)   | Veröffentlichung auf Aleph IPFS, DNS, SEO                         |
| [`CLAUDE.md`](CLAUDE.md)             | Konventionen für die Arbeit mit Claude Code                       |

## Lizenz

Apache-2.0 OR MIT
