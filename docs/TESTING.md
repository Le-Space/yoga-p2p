# TESTING.md

## Was wo läuft

| Kommando         | Umfang                                                                      |
| ---------------- | --------------------------------------------------------------------------- |
| `pnpm test:unit` | vitest in **Node** — der Ledger. Kein Browser, keine Netzwerk-Abhängigkeit. |
| `pnpm test:e2e`  | Playwright, Chromium. Baut die App und fährt sie über `vite preview`.       |
| `pnpm test`      | beides                                                                      |
| `pnpm check`     | svelte-check gegen `jsconfig.json`                                          |
| `pnpm lint`      | prettier + eslint                                                           |

## Der Handshake im Test

`connectViaPaste(offerer, answerer)` aus `e2e/fixtures.js` fährt alle drei
Schritte durch: Offer erzeugen → im zweiten Kontext einfügen → Answer
zurücktragen. Das ist der Default für die Masse der Tests, weil dabei dieselbe
Signalisierung läuft wie beim QR-Pfad, nur ohne Video-Decoding — ein Fehler ist
damit nie mehrdeutig.

Alle Verbindungs-Tests laufen mit `?ice=host`: keine STUN-Abfrage, keine
Abhängigkeit vom Netz des CI-Runners, deterministische Kandidatenmenge.

**Noch offen:** `connectViaCamera` (Fake-Video-Capture mit gerendertem
Offer-QR) ist für T2.1 vorgesehen. Die Chromium-Flags stehen bereits in
`playwright.config.js`; es fehlt die Erzeugung der `.y4m`-Datei aus dem
gerenderten QR-Bild.

## Identität

`e2e/webauthn.js` hängt einen CDP Virtual Authenticator an den Browser-Kontext.
`hasLargeBlob: true` ist kein Detail — ohne das fällt der Recovery-Pfad
stillschweigend auf localStorage zurück und wird nicht mehr getestet.

Im Identity-Provider gibt es **keinen** Test- oder Bypass-Modus, und es darf
auch nie einen geben. Der Emulator ist die Nahtstelle.

## Sprache

Die Sprache folgt dem Gerät. Ein Test, der eine Sprache erwartet, setzt sie
explizit über `browser.newContext({ locale })` — niemals durch Annahme. Die
Selektoren sind ausschließlich `data-testid`, damit dieselbe Spec in beiden
Sprachen läuft.

## a11y

`e2e/a11y.spec.js` fährt axe über jeden Screen in beiden Themes. Die Assertion
vergleicht eine kompakte Projektion der Violations, damit ein Kontrastfehler
sofort zeigt, welcher Token schuld ist, statt hunderte Zeilen Rohausgabe zu
liefern.

Ein Kontrastfehler wird durch einen abgeleiteten Token gelöst und in
`docs/DESIGN.md` dokumentiert — nie durch Ausschluss der Regel.

## Checkliste für echte Geräte

Was die Emulation nicht abdeckt und vor einem Studio-Einsatz manuell zu prüfen
ist:

- **Scan-Abstand und Fokus:** Offer-QR auf einem Telefon-Display, gescannt von
  einem Tablet aus ~20–30 cm. Autofokus braucht bei manchen Tablets einen
  Moment.
- **Display-Helligkeit:** Der QR bleibt in beiden Themes auf hellem Grund
  (`.qr-field`), aber ein stark abgedunkeltes Display scannt trotzdem schlecht.
- **Rückkamera:** Die App fragt `facingMode: environment` an. Auf Geräten ohne
  Rückkamera fällt der Browser auf die Frontkamera zurück — das ist in Ordnung,
  aber der Nutzer sieht sich selbst und braucht einen Hinweis.
- **Kamera-Berechtigung abgelehnt:** Der Copy-&-Paste-Pfad muss dann noch
  erreichbar sein, ohne Neuladen.
- **Symmetrisches NAT:** Der Remote-Pfad kann ohne TURN scheitern
  (`docs/LIMITS.md` §1.2). Der Assistent muss das benennen, nicht endlos drehen.
