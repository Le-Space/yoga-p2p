# DESIGN.md — Le-Space-Tokens und ihre Herkunft

Quelle aller Werte: `Le-Space/landing → docs/le-space-brand`. Maschinenlesbar
sind die Build-Skripte, die den PDF-Styleguide erzeugen:

- `build/build_styleguide.py` — Palette, Semantik, Typo-Skala, Radien
- `build/build_brand.py` — Logo-/Favicon-Palette
- `Le-Space-Brand-Style-Guide.pdf` — das erzeugte Dokument

Regel: kein Token ohne Zeile in dieser Tabelle. Werte, die im Brand-Verzeichnis
nicht definiert sind, stehen als **abgeleitet** drin — sie sind Kandidaten für
eine Rückführung ins Brand-Repo, nicht lokale Wahrheit.

## Namensschema

Rohtokens tragen den Präfix `--ls-` und sind die einzige Quelle. Sie werden
unten in `tokens.css` in die Tailwind-Namensräume gemappt. Der Präfix ist nicht
Kosmetik: Tailwind 4 besitzt `--color-*`, `--radius-*` und `--font-*` selbst,
ein unpräfixierter Rohtoken würde auf sich selbst zeigen.

Der Plan (`docs/PLAN.md` §8.1) skizziert `--color-bg` als Rohtoken und eine
`tailwind.config.js`. Beides gilt für Tailwind 3; unter Tailwind 4 leisten
`--ls-*` plus `@theme inline` dasselbe.

## Dark Mode — die native Palette

| Token                 | Wert                                 | Herkunft                                                                 |
| --------------------- | ------------------------------------ | ------------------------------------------------------------------------ |
| `--ls-bg`             | `#0B0E15`                            | Deep Space, `build_styleguide.py:25`                                     |
| `--ls-surface`        | `#141926`                            | Nebula, `:26`                                                            |
| `--ls-surface-raised` | `#1B2233`                            | **abgeleitet** — Nebula angehoben für gestapelte Panels                  |
| `--ls-border`         | `#232B3D`                            | Horizon, `:27`                                                           |
| `--ls-text`           | `#EDF1F8`                            | Starlight, `:28`                                                         |
| `--ls-text-muted`     | `#A8B3C7`                            | Stardust, `:29`                                                          |
| `--ls-text-faint`     | `#7F89A0`                            | **abgeleitet** aus Comet Grey `#6B7690` (`:30`) — siehe Kontrast         |
| `--ls-accent`         | `#FF6B5B`                            | Signal Coral, `:31`                                                      |
| `--ls-link`           | `#58C7F3`                            | Sync Cyan, `:33`                                                         |
| `--ls-success`        | `#3EDC97`                            | Mint, `:35`                                                              |
| `--ls-warning`        | `#FFC24B`                            | Amber, `:36`                                                             |
| `--ls-danger`         | `#FF4D6A`                            | Error, `:38` — bewusst kühler als Signal Coral                           |
| `--ls-layer-*`        | Mint / Amber / Cyan / Violet / Coral | Stack-Layer, `build_styleguide.py` Abschnitt „03 · Farben / Stack-Layer" |

## Light Mode

Der Styleguide definiert Light Mode nur für **Print**: „Hintergrund `#FFFFFF`,
Text Ink `#141B2E`, Coral → `#E8503F`, Cyan → `#0E86C4`" (Abschnitt 03).
Eine Bildschirm-UI braucht zusätzlich eine Trennung von Seitengrund und
Fläche, die es im Print nicht gibt — diese Slots sind abgeleitet.

| Token                 | Wert      | Herkunft                                    |
| --------------------- | --------- | ------------------------------------------- |
| `--ls-bg`             | `#EDF1F8` | **abgeleitet** — Starlight als Seitengrund  |
| `--ls-surface`        | `#FFFFFF` | brand-definiert (Light-Hintergrund)         |
| `--ls-surface-raised` | `#F2F5FB` | **abgeleitet**                              |
| `--ls-border`         | `#D4DCEA` | **abgeleitet** aus der Horizon-Hue          |
| `--ls-text`           | `#141B2E` | Ink, `build_styleguide.py:39`               |
| `--ls-text-muted`     | `#41506B` | **abgeleitet** — 7,2:1, unverändert AA-fest |
| `--ls-text-faint`     | `#626E85` | **abgeleitet**                              |
| `--ls-accent`         | `#D22C19` | **abgeleitet** aus Coral-Light `#E8503F`    |
| `--ls-link`           | `#0C74AA` | **abgeleitet** aus Cyan-Light `#0E86C4`     |
| `--ls-success`        | `#177D54` | **abgeleitet** aus Mint                     |
| `--ls-warning`        | `#936513` | **abgeleitet** aus Amber                    |
| `--ls-danger`         | `#D32444` | **abgeleitet** aus Error                    |

## Kontrast: gemessen, nicht angenommen

Der axe-Lauf (`e2e/a11y.spec.js`, beide Themes, alle Screens) hat mehrere
Brand-Werte als AA-untauglich für Fließtext ausgewiesen. Gemessen wurde gegen
alle drei Gründe des jeweiligen Themes (`bg`, `surface`, `surface-raised`);
angegeben ist der schlechteste Wert.

| Wert                  | Verwendung              | Ratio vorher | ersetzt durch | Ratio nachher |
| --------------------- | ----------------------- | ------------ | ------------- | ------------- |
| Cyan-Light `#0E86C4`  | Links, Navigation       | 3,55:1       | `#0C74AA`     | 4,53:1        |
| Coral-Light `#E8503F` | Eyebrow-Labels, Buttons | 3,28:1       | `#D22C19`     | 4,51:1        |
| Amber-Light `#C7891A` | Warnhinweise            | 2,64:1       | `#936513`     | 4,51:1        |
| Mint-Light `#1FA971`  | Erfolgszustände         | 2,66:1       | `#177D54`     | 4,52:1        |
| Comet Grey `#6B7690`  | Metatext (dark)         | 3,49:1       | `#7F89A0`     | 4,53:1        |

Vorgehen bei der Ableitung: Hue und Sättigung des Brand-Werts bleiben, nur die
Helligkeit wandert in Schritten von 0,1 %, bis der Wert 4,5:1 auf allen Gründen
erreicht — der erste Treffer wird genommen. Damit bleibt die Farbe erkennbar
dieselbe.

Die Originale bleiben korrekt für das, wofür der Guide sie definiert: Print,
große Display-Typo und nicht-textliche Marken-Elemente. Die `--ls-layer-*`
behalten deshalb ihre Brand-Werte — sie beschriften Diagramme und Chips, keinen
Fließtext.

Der Guide notiert „Coral auf Deep Space 6,6:1 — beide AA-konform". Das stimmt
für Coral auf **Deep Space**; auf **Nebula** (Cards) und im Light Mode auf Weiß
gilt es nicht. Das ist die Upstream-Frage in `docs/LIMITS.md`.

## Form und Typografie

| Token                         | Wert                                                                                      | Herkunft                                                            |
| ----------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `--ls-radius-card`            | `10px`                                                                                    | Abschnitt 05: „Radius 10 px für Karten"                             |
| `--ls-radius-control`         | `8px`                                                                                     | Abschnitt 05: „8 px für Buttons"                                    |
| Border                        | `1px`, Horizon                                                                            | Abschnitt 05                                                        |
| `--ls-font-mono`              | JetBrains Mono                                                                            | Abschnitt 04 — die Markenstimme                                     |
| `--ls-font-body` / `-display` | Inter                                                                                     | Abschnitt 04 — die Arbeitsschrift                                   |
| Typo-Skala                    | Display clamp(40–64)/1.05 · H1 40/1.1 · H2 28/1.2 · H3 20/1.3 · Body 16/1.6 · Meta 14/1.5 | Abschnitt 04                                                        |
| `.eyebrow`                    | Mono Bold, Caps, +8 % Tracking                                                            | Abschnitt 04                                                        |
| `--ls-shadow-card`            | `0 1px 2px rgb(0 0 0 / .06)`                                                              | **abgeleitet** — der Guide arbeitet mit Rahmen, nicht mit Elevation |

**Fonts sind noch nicht eingebunden.** `tokens.css` deklariert Inter und
JetBrains Mono mit System-Fallbacks; die Schriftdateien liegen nicht im
Brand-Verzeichnis. Bis sie da sind, rendert die App in den Fallbacks — offen
für M1.

## Gestaltungsregeln, die aus dem Guide folgen

- **Eine Coral-Aktion pro Ansicht.** Die Akzentfarbe markiert Aktionen und
  Statuswechsel, nicht Dekoration. In `TicketCard.svelte` ist das die einzige
  Stelle, an der ein Guthaben mit Restwert steht — aufgebraucht und storniert
  treten in `muted`/`faint` zurück.
- **Fokus ist Cyan, nicht Coral.** Sonst konkurriert der Fokusring mit der
  einen Aktion.
- **QR-Felder bleiben in beiden Themes hell** (`.qr-field`), sonst scannt keine
  Kamera im Dark Mode.

## Die Marke: ॐ als lokaler Knoten

Die Le-Space-Bildsprache hat eine feste Grammatik (Styleguide, Abschnitt 06):
Ein **gefüllter Coral-Kreis** ist der lokale Knoten — „dieser Knoten, hier,
du". **Cyan umrandete Kreise** sind Peers, Linien sind Verbindungen (gestrichelt
= sporadisch). Die App-Marke ersetzt genau ein Element: an der Stelle des
lokalen Knotens steht das **ॐ**.

Das ist keine Dekoration, sondern die Aussage der App: Die eigene Praxis ist
der Knoten, Studio und weitere Standorte sind Peers. Die Grammatik bleibt
unangetastet, damit die Marke neben anderen Le-Space-Marken lesbar bleibt.

### Zwei Kompositionen, nicht eine

Der Styleguide schreibt es vor: „Ab 48 px abwärts gilt die vereinfachte
Favicon-Variante: lokaler Knoten + ein Peer + eine Verbindung."

| Variante         | Aufbau                             | Verwendung                        |
| ---------------- | ---------------------------------- | --------------------------------- |
| **Vollmarke**    | ॐ + 2 Peers + 3 Verbindungen       | App-Icons, OG-Bild, große Flächen |
| **Kleine Marke** | ॐ (größer) + 1 Peer + 1 Verbindung | Favicon, Header, alles ≤ 48 px    |

Die Vollmarke ist bewusst ruhiger als das Le-Space-Original, das zusätzlich
einen vierten, schwachen Punkt trägt: Ein Glyph liest sich unruhiger als eine
gefüllte Scheibe, also muss die Komposition drumherum zurücktreten.

### Der Glyph

`src/lib/assets/om-glyph.js` enthält den Umriss von **U+0950 DEVANAGARI OM**,
einmalig aus **Noto Sans Devanagari** (SIL Open Font License 1.1,
`google/fonts → ofl/notosansdevanagari`) mit opentype.js extrahiert.

Als Pfad und nicht als `<text>`, weil ein Textelement eine installierte
Devanagari-Schrift voraussetzt — auf den meisten Windows- und Android-Geräten
würde die Marke sonst stillschweigend als Kästchen erscheinen. Weder die
Schriftdatei noch opentype.js sind dadurch Abhängigkeiten dieses Repositories;
der eingebettete Pfad ist das gesamte Ergebnis.

### Umgang mit dem Zeichen

ॐ ist ein heiliges Symbol im Hinduismus, Buddhismus und Jainismus. Verbindlich
für dieses Projekt:

- Das Zeichen wird **ganz, aufrecht und unverändert** verwendet. Nie gespiegelt,
  gedreht, beschnitten oder in dekorative Striche zerlegt.
- Es steht nicht auf Flächen, die als „darauf tritt man" lesbar sind, und
  nicht in Kontexten, in denen es abgeschnitten wird.
- Eine Variante, die den Glyphen in Netzwerkstriche auflöst, wurde bewusst
  **nicht** entworfen — sie wäre die naheliegende gestalterische Idee und
  zugleich die respektloseste.

### Erzeugung

```bash
node scripts/build-logo.mjs      # SVGs, PNGs, favicon.ico
node scripts/build-og-image.mjs  # Social-Card
```

Beides leitet sich aus derselben Quelle ab wie die UI
(`src/lib/assets/om-glyph.js`, Tokens oben), damit Icons und Oberfläche nicht
auseinanderlaufen. `src/lib/components/OmMark.svelte` rendert dieselbe Marke
inline für den Header — mit `var(--ls-accent)` und `var(--ls-link)` statt
fester Hex-Werte.

Farben: Coral und Cyan erreichen beide auf Deep Space **und** auf Starlight
AA, deshalb genügt **eine** Datei für beide Themes. Die Icon-PNGs stehen wie
das Le-Space-App-Icon auf Deep-Space-Grund; das Maskable-Icon hat 20 % Rand,
damit Androids Kreisbeschnitt nichts abschneidet.

**Bekannte Grenze:** Bei 16 px verliert das ॐ seine Binnenzeichnung — es bleibt
als Silhouette erkennbar, aber nicht mehr als Schriftzeichen lesbar. Das ist
bei dieser Glyphenkomplexität nicht zu vermeiden; moderne Browser nehmen
ohnehin die 32-px- oder SVG-Variante.

## Assets

Alles in `static/` wird aus den beiden Build-Skripten oben erzeugt und ist
nicht von Hand zu bearbeiten:

| Datei                                        | Inhalt                                           |
| -------------------------------------------- | ------------------------------------------------ |
| `logo-mark.svg`                              | Vollmarke, transparent                           |
| `favicon.svg`                                | kleine Marke, transparent                        |
| `favicon-32x32.png`, `favicon-16x16.png`     | kleine Marke, gerastert                          |
| `favicon.ico`                                | beide Raster in einem Container                  |
| `android-chrome-192x192.png`, `-512x512.png` | Vollmarke auf Deep Space                         |
| `apple-touch-icon.png`                       | Vollmarke auf Deep Space, 180 px                 |
| `maskable-512x512.png`                       | Vollmarke, 20 % Rand für Androids Kreisbeschnitt |
| `og-image.png`                               | Social-Card, 1200 × 630                          |

Die früheren Le-Space-Platzhalter (`app-icon.svg`, `logo-dark.svg`,
`logo-light.svg`, das alte `favicon.ico`) sind entfernt — sie hätten sonst
weiterhin die Le-Space-Marke unter dem Namen dieser App ausgeliefert.
