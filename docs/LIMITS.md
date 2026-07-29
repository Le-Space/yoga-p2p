# LIMITS.md — bekannte Grenzen und Upstream-Fragen

Was diese App nicht kann, und warum. Nichts hiervon wird lokal gepatcht oder
gevendort (siehe `CLAUDE.md`); jeder Punkt ist entweder eine bewusste
Entwurfsgrenze oder eine Upstream-Frage.

## 1. Entwurfsgrenzen

### 1.1 Double-Spend bei dauerhaft getrennten Locations

Prävention gegen einen aktiv manipulierten Client ist ohne Server oder Trusted
Hardware unlösbar — das klassische Offline-E-Cash-Problem. Diese App setzt auf
**Erkennung statt Verhinderung**: monotone `seq` + `prevRedeemHash` +
Gerätesignatur machen jeden zurückgesetzten Ledger beim nächsten Sync als Fork
sichtbar, mit beiden signierten Events als Beweis.

Der Schaden pro Vorfall ist eine Yogastunde. Der Reducer ist zusätzlich so
gebaut, dass ein mehrdeutiger Log nie Guthaben _erzeugt_: ein Fork verbraucht
genau eine Einheit, eine fehlende Kettenposition ebenfalls.

### 1.2 Zwei Dinge, die wie Infrastruktur aussehen und keine sind

**gossipsub.** OrbitDB verteilt seine Log-Heads über `libp2p.services.pubsub`;
ohne pubsub repliziert nichts. Gossipsub läuft hier ausschließlich innerhalb
der direkten, per QR ausgehandelten WebRTC-Verbindung. Kein Broker, kein
Rendezvous, keine Peer-Discovery (`pubsubPeerDiscovery` ist bewusst nicht
eingebunden).

**STUN.** Ohne STUN gibt es nur Host-Kandidaten — das reicht im LAN und in CI,
nicht über NAT. STUN teilt einem Gerät nur seine eigene öffentliche Adresse
mit; es fließen weder Nutzdaten noch Signalisierung darüber. Es bleibt ein
Aufruf bei einem Dritten, der die IP des Geräts sieht: deshalb konfigurierbar
über `VITE_STUN_SERVERS` und per `?ice=host` vollständig abschaltbar. Default
sind zwei Anbieter (Google, Cloudflare) — für ein Studio, das das nicht will,
ist ein eigener STUN-Server ein Einzeiler in der Env.

**Kein TURN.** Symmetrische NATs auf beiden Seiten können ohne TURN nicht
verbinden. Der Remote-Pfad (Copy & Paste über Messenger) schlägt dort fehl;
der Studio-Pfad (QR, gleiches Netz) ist davon nicht betroffen. Der
Verbindungs-Assistent muss diesen Fall ehrlich benennen statt endlos zu drehen.

### 1.3 Privacy: OrbitDB repliziert ganze Datenbanken — und kennt keine Leserechte

Zwei getrennte Punkte, die oft vermischt werden:

**Voll-Replikation.** Es gibt keine Teil-Replikation. Wer eine
`bookings-<location>`-DB repliziert, hat damit auch die Buchungen aller
anderen darin: DID, Anzeigename, Kurs, Termin, Status.

**Keine Lese-ACL.** Der Access Controller regelt ausschließlich `canAppend`.
Wer eine Datenbankadresse kennt und einen Peer erreicht, der sie hält, kann
sie vollständig lesen. „Schüler replizieren nur den eigenen Ticket-Ledger" ist
deshalb eine Verteilungs-Konvention, keine durchgesetzte Grenze.

Vollständige Aufstellung der betroffenen Daten und Metadaten, was
Verschlüsselung daran ändert und was nicht:
[`docs/PRIVACY.md`](./PRIVACY.md). Die dortige Empfehlung ist ein anderer
Zuschnitt (Buchungs-DB pro Schüler), nicht Verschlüsselung — bei Multi-Writer
handelt man sich sonst ein Schlüsselverteilungs- und Rotationsproblem ein.

### 1.4 Feld-Level-Rechte fehlen in OrbitDB-ACLs

Die Statusregel „Studio-Geräte setzen `confirmed|declined`, Schüler nur
`requested|cancelled`" ist **App-Logik über der DB-ACL**, nicht von der DB
erzwungen. Ein manipulierter Client mit Write-Grant kann jeden Status
schreiben. Erkennbar bleibt es über `entry.identity` — die Rolle des Schreibers
steht in der Registry.

### 1.5 Widerrufs-Latenz

Ein widerrufenes Gerät kann bis zur nächsten Verbindung weiter gültig
signieren. Der Reducer wertet Events **ab Kenntnis des Widerrufs** aus:
alles mit Zeitstempel nach `revokedAt` wird abgelehnt, alles davor bleibt
gültig. Rückwirkende Ungültigkeit würde einen Tag legitim verkaufter Tickets
vernichten.

### 1.6 QR-Payload-Größe

Ein signiertes, deflate-komprimiertes Offer liegt nahe an dem, was ein
Telefon von einem Bildschirm noch zuverlässig liest. Über
`QR_CHARACTER_BUDGET` (2200 Zeichen) rendert die App **keinen** Code, sondern
verweist auf Copy & Paste. Multi-Frame-QR (BC-UR) ist bewusst auf v2 verschoben.

## 2. Upstream-Fragen

### 2.1 `@le-space/libp2p-webrtc-qr`

- **Kein Replay-Window.** Payloads tragen eine `sessionId`, aber keinen
  Zeitstempel, laufen also nicht von selbst ab (dokumentiert im README des
  Pakets). Für Tickets ist das folgenlos — eine Entwertung ist nie
  token-basiert, sondern immer ein verifizierter Ledger-Write. Für die
  Verbindung selbst wäre ein Zeitfenster trotzdem richtig.
- **Kleinerer Payload** (QWBP-Richtung) würde den Copy-&-Paste-Fallback aus
  1.6 seltener nötig machen.
- **Vendored `@libp2p/webrtc`-Internals**: das Paket kopiert Interna, die
  upstream nicht exportiert sind. Ein `exports`-Eintrag bei `@libp2p/webrtc`
  würde die Kopie überflüssig machen.
- **Firefox/WebKit** sind nicht getestet. Chromium ist deshalb das PR-Gate,
  die anderen laufen nightly und non-blocking.

### 2.2 `@le-space/orbitdb-identity-provider-webauthn-did`

#### Das Identitätsdokument ist über Reloads nicht stabil — blockiert T2.2

**Der schwerwiegendste offene Punkt.** Die DID bleibt über Seitenladevorgänge
konstant (sie stammt aus dem Passkey), das **Identitätsdokument** dazu aber
nicht: Gemessen am 2026-07-29 ergaben drei Reloads **drei verschiedene
Identitäts-Hashes bei einer stabilen DID**.

Warum das die Replikation zerstört: Jeder OrbitDB-Eintrag verweist über
`entry.identity` auf den **Hash** des Dokuments, das ihn signiert hat. Ein
prüfendes Gerät muss genau dieses Dokument auflösen; gelingt das nicht, gibt
`canAppend` false zurück, und OrbitDB **verwirft den Eintrag endgültig** — ohne
Retry und ohne Fehler, den jemand mitbekäme. Sichtbar wird nur:
`Could not append entry: Key "<hash>" is not allowed to write to the log`.

Beobachtetes Verhalten in `e2e/m2-studio-join.spec.js`: Alices **Registry
repliziert** zu Bob (2 Einträge), ihr **Programm nicht** (0 Einträge). Der
Unterschied ist allein, welche Sitzung den jeweiligen Eintrag signiert hat.
Mesh, Subscriptions, Sync-Peers und Zugriffsrechte sind auf beiden Seiten
nachweislich korrekt — geprüft über `window.__yoga` (siehe
`src/lib/p2p/node.js`).

Ausgeschlossen wurde:

- **Gossipsub** — 16.1.0 auf beiden Seiten, Mesh gegraftet, Topics abonniert.
- **Ein persistenter Keystore** (`KeyStore` + `LevelStorage`) — eingebaut, weil
  ein Keystore, der bei jedem Laden neue Schlüssel erzeugt, ohnehin falsch ist.
  Er behebt die Hash-Instabilität **nicht**.
- **Ein verzögerter Resync** (`sync.stop()`/`start()`, auch mit Pause) — holt
  verworfene Einträge nicht zurück.

Verdacht: die Warnung `Failed to extract real public key from WebAuthn
credential, using fallback: Error: Insufficient data`, die der Provider bei
jedem Start ausgibt. Der Fallback erzeugt offenbar bei jedem Lauf ein anderes
Schlüsselmaterial.

**Isoliert reproduziert** in `repro/webauthn-identity-stability/` — ohne diese
App, ohne libp2p, ohne Replikation. Der Repro zeigt auch das genaue Feld:

| Feld                   | über 3 Reloads     |
| ---------------------- | ------------------ |
| `id` (DID)             | stabil             |
| `publicKey`            | **stabil**         |
| `signatures.id`        | stabil             |
| `signatures.publicKey` | **3 verschiedene** |

`signatures.publicKey` ist eine **live erzeugte WebAuthn-Assertion**. Die
enthält per Konstruktion bei jedem Aufruf eine frische Challenge und einen
inkrementierten Zähler, und ECDSA signiert randomisiert. Ein Dokument, das eine
Assertion einbettet, kann niemals stabil content-adressiert sein — das ist ein
Entwurfskonflikt, kein Flüchtigkeitsfehler: Content-Adressierung braucht
Determinismus, WebAuthn-Assertions sind absichtlich nicht deterministisch.

`createIdentity` in `@orbitdb/core` signiert zudem bei **jedem** Aufruf neu und
kennt keinen Cache-Lookup — ein persistenter Storage-Parameter hilft deshalb
nicht.

**Lokale Abhilfe, umgesetzt:** `stableIdentity()` in `src/lib/p2p/node.js` merkt
sich den Hash des zuerst erzeugten Dokuments und verwendet es danach wieder. Da
nur die Signatur variiert, bleibt das erste Dokument dauerhaft gültig. Weil
`getIdentity()` es ohne `sign`-Funktion zurückgibt, wird der Signierer der
frisch erzeugten Identität geliehen — derselbe private Schlüssel, wie der
stabile Public Key belegt. Abgesichert durch `e2e/m2-identity.spec.js`.

**Vorschlag nach upstream:** die Assertion nicht einbetten (Schlüssel per PRF
ableiten und deterministisch signieren), oder in `createIdentity` vor dem
Signieren nach einer vorhandenen Identität für die id suchen.

**Stand T2.2:** Beitritt und Registry-Replikation funktionieren. Ob die
Identitätskorrektur auch die Programm-Replikation repariert, ist **noch nicht
belegt** — die beiden E2E-Szenarien laufen ins Zeitlimit, bevor sie dort
ankommen (jeder Seitenaufruf startet einen kompletten libp2p-, Helia- und
OrbitDB-Stack). Sie stehen als `test.fixme` im Spec; sie grün zu bekommen ist
eine Testperformance-Aufgabe, kein Protokollproblem.

#### Weitere Punkte

- **Typen zu streng**: `createCredential`, `writeLargeBlobMetadata`,
  `readLargeBlobMetadata` und die Provider-Factory deklarieren jede Option als
  Pflichtfeld, obwohl die Implementierung sie defaultet; Rückgaben sind
  `Object` statt der tatsächlichen Form. Aufrufstellen casten deshalb an der
  Grenze (`src/lib/identity/passkey-identity.js`, `src/lib/p2p/node.js`).
- **Create-or-Recover-Flow ist nur Demo-Code** im `examples/`-Verzeichnis.
  `src/lib/identity/passkey-identity.js` ist eine Kopie davon; sobald der
  Flow upstream als Helfer exportiert ist, ersetzt der Import diese Datei.
- **E2E-Helper nicht exportiert**: Der CDP-Virtual-Authenticator-Helfer aus den
  dortigen E2E-Tests musste nach `e2e/webauthn.js` kopiert werden.

### 2.3 `@orbitdb/core`

- `createOrbitDB` akzeptiert `identities` zur Laufzeit, die Typdeklaration
  kennt den Parameter nicht.
- Feld-Level-Rechte in Access-Controllern (siehe 1.4).

### 2.4 Le-Space Brand-Repo

Mehrere Brand-Werte verfehlen WCAG AA für Fließtext auf den Gründen, für die
sie gedacht sind — Cyan-Light 3,55:1, Coral-Light 3,28:1, Comet Grey auf Nebula
3,49:1 (Messwerte und Ersatzwerte in `docs/DESIGN.md`). Der Guide nennt
„Coral auf Deep Space 6,6:1 — AA-konform", was für Deep Space stimmt, für
Nebula und für Weiß aber nicht.

Vorschlag nach upstream: eine dokumentierte **Text-Variante** je Akzentfarbe,
zusätzlich zur Marken-Variante. Die hier abgeleiteten Werte sind der Entwurf
dafür.

Außerdem fehlen die Schriftdateien (Inter, JetBrains Mono) im Brand-Verzeichnis
— die App rendert bis dahin in System-Fallbacks.

## 3. Noch nicht gemessen

Die Skalierungszahlen in `docs/PLAN.md` §6.4 sind Schätzungen. Die
Benchmark-Suite (`bench/`, T5.5) existiert noch nicht; bis dahin ist keine
Aussage über Cold Start, Erst-Pairing oder Reconciliation-Dauer belegt.
Budget-Verletzungen werden hier protokolliert und lösen eine Design-Aktion aus
— niemals eine Anhebung des Budgets.
