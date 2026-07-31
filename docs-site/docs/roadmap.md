---
title: Was noch kommt
sidebar_position: 40
---

# Was noch kommt

Diese Seite ist absichtlich vorsichtig formuliert. Was hier steht, ist geplant oder
angedacht — nicht versprochen. Was die App **heute** kann, steht in den Kapiteln
davor; was sie nicht kann, unter [Was die App nicht kann](/what-it-cannot-do).

## Einladungslinks statt Code-Schieberei — als Nächstes

**Der wichtigste offene Punkt.** Heute verbindet man zwei Geräte, indem jemand
einen Code trägt: QR scannen, oder Text kopieren, einfügen, Antwort zurücktragen.
Ein Feldtest hat gezeigt, woran das scheitert — welches Textfeld, welche Rolle,
welche von zwei Zeichenketten die richtige ist.

Der Nachfolger ist ein **Einladungslink**. Man erzeugt eine Einladung, teilt sie
über das normale Teilen-Menü, und das andere Gerät öffnet sie einfach. Die Seite
prüft die Einladung und erzeugt die Antwort von selbst. Kein Textfeld, keine Rolle,
keine Verwechslung.

Wichtig für die Privatsphäre, und der Grund, warum das überhaupt vertretbar ist:
Die Daten stehen im **Fragment** der Adresse — dem Teil hinter dem `#`. Den
schicken Browser grundsätzlich nicht an einen Server. Der Link sieht aus, als führe
er irgendwohin; der empfindliche Teil verlässt das Gerät trotzdem nicht.

Der QR-Code bleibt: Er enthält dann den Link. Er wird um knapp 30 Zeichen länger
und liegt weiterhin deutlich unter dem, was eine Kamera zuverlässig liest.

Mitgeliefert wird außerdem eine Korrektur, die im Studio spürbar ist: Die
Verbindung gab nach 30 Sekunden auf, obwohl ihr Aufbau länger dauern kann.

Umgesetzt ist das im Beispiel von
[`libp2p-webrtc-qr` v0.2.0](https://github.com/NiKrause/libp2p-webrtc-qr/releases/tag/v0.2.0);
was es für diese App bedeutet, steht in
[Issue #23](https://github.com/Le-Space/yogasuci/issues/23).

## Ein Verbindungs-Check, bevor es klemmt

Wenn eine Verbindung nicht zustande kommt, sieht man heute nur, dass sie nicht
zustande kommt. Woran es liegt — Browser, Netz, Kamera — muss man raten, und zwar
an der Theke, mit wartenden Leuten.

Geplant ist eine Übersicht, die das vorher prüft und jede Zeile grün, orange oder
rot schaltet:

- **Browser** — kann er WebRTC überhaupt? Es gibt Browser, die es nicht können,
  und dann hilft kein Netz der Welt.
- **Netz und STUN** — ist ein STUN-Server erreichbar? Er wird gebraucht, sobald
  zwei Geräte nicht im selben WLAN hängen. Wer die App bewusst mit `?ice=host`
  ohne STUN betreibt, bekommt hier **orange**, keine Fehlermeldung: Das ist eine
  Einstellung, keine Störung.
- **TURN** — nur, wenn es nötig wird. Heute ist keiner eingerichtet, und in
  manchen Netzen — Firmen-WLAN, mancher Mobilfunk — reicht STUN nicht. Die Zeile
  soll das benennen statt es zu verschweigen.
- **Kamera** — freigegeben und liefert sie ein Bild? Ohne Kamera fällt das
  QR-Scannen aus.

**Das Mikrofon wird bewusst nicht geprüft.** Die App fordert es nie an; ein rotes
Licht dafür würde vor etwas warnen, das nichts kaputtmachen kann.

Was so ein Check **nicht** kann, und das gehört dazu: Dass ein STUN-Server
antwortet, heißt nicht, dass sich diese zwei Geräte finden. Die Ampel zeigt, ob die
Voraussetzungen stimmen — nicht, ob es klappt.

Einzelheiten in [Issue #26](https://github.com/Le-Space/yogasuci/issues/26).

## Sicherung auf dezentralem Speicher

Heute liegt eure Sicherung dort, wo ihr sie hinlegt: Der **Export** lädt eine Datei
herunter, und wo die landet, entscheidet ihr. Ohne Server gibt es dazu keine
Alternative — es gibt niemanden, bei dem etwas läge.

Das ist tragfähig, aber es hat eine unangenehme Kante: Gehen **alle** Geräte eines
Studios zugleich verloren — Diebstahl, Brand, Wasserschaden — dann existiert nur
noch, was jemand exportiert und weggelegt hat.

Geplant ist deshalb eine **optionale** Sicherung auf dezentralem Speicher, etwa
über **Filecoin**. Optional in einem strengen Sinn: Ein Studio, das das nicht will,
verliert keine Funktion. Wer es einschaltet, bekommt eine Kopie, die einen
Totalverlust der Geräte übersteht.

### Woran es gerade hängt

Ein Modul dafür ist bereits geschrieben:
[`orbitdb-storacha-bridge`](https://github.com/NiKrause/orbitdb-storacha-bridge).
Es zerlegt eine OrbitDB-Datenbank in ihre Blöcke — Log-Einträge, Manifest,
Identitäten, Zugriffsrechte — lädt sie einzeln hoch und setzt sie beim
Wiederherstellen so zusammen, dass die ursprüngliche Identität erhalten bleibt.
Genau das ist der schwierige Teil: Eine Sicherung, die die Identität verliert,
ergibt eine Datenbank, deren alte Einträge niemand mehr prüfen kann.

Der Haken: Das Modul lädt über die Infrastruktur von **Storacha** hoch, und
Storacha existiert als Unternehmen nicht mehr. Es muss also auf einen anderen
Anbieter umgestellt werden, bevor es hier zum Einsatz kommen kann. Das ist Arbeit
an einer bekannten Stelle, kein offener Entwurf — aber es ist getan, wenn es getan
ist, und deshalb steht hier kein Datum.

### Was dabei bedacht werden muss

Eine Kopie auf fremdem Speicher wirft genau die Fragen auf, die diese App sonst
nicht hat, und sie sind vor der Umsetzung zu beantworten:

- **Wer kann sie lesen?** Eine unverschlüsselte Sicherung auf öffentlichem Speicher
  wäre das Gegenteil dessen, wofür diese App gebaut ist. Verschlüsselung ist hier
  keine Zutat, sondern Voraussetzung — und anders als bei den geteilten
  Datenbanken ist sie hier einfach, weil es genau **eine** lesende Stelle gibt: das
  Studio (siehe die Aufstellung in `docs/PRIVACY.md`).
- **Was passiert mit einer Löschanfrage?** Was auf verteiltem Speicher liegt, lässt
  sich nicht zurückholen. Der gangbare Weg ist, den Schlüssel zu vernichten statt
  die Daten — das setzt voraus, dass von Anfang an verschlüsselt wird.
- **Ändert es das Datenschutzverhältnis?** Heute verarbeitet niemand außer euch
  etwas. Ein Speicheranbieter wäre eine dritte Stelle — und dann stellt sich die
  Frage nach einem Auftragsverarbeitungsvertrag, die es derzeit ausdrücklich nicht
  gibt. Auch das gehört geklärt, bevor der Schalter existiert.

## Was sonst noch offen ist

- **Reihen-Tickets für einzelne Termine.** Eine Reihe lässt sich buchen; eine
  einzelne Stunde daraus zu verkaufen, fehlt noch.
- **Datenschutzinformation für Schüler.** Eine Vorlage, die ein Studio anpassen und
  aushändigen kann — verantwortlich seid ihr, nicht wir.
- **Löschkonzept.** Die Logs sind append-only. Was das für eine Löschanfrage
  bedeutet, ist offen und wird nicht schöngeredet.

Der vollständige, technische Stand steht im
[Projektarchiv](https://github.com/Le-Space/yogasuci) — dort auch alles, was hier
zu klein für ein eigenes Kapitel ist.
