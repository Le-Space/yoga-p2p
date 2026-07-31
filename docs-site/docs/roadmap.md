---
title: Was noch kommt
sidebar_position: 40
---

# Was noch kommt

Diese Seite ist absichtlich vorsichtig formuliert. Was hier steht, ist geplant oder
angedacht — nicht versprochen. Was die App **heute** kann, steht in den Kapiteln
davor; was sie nicht kann, unter [Was die App nicht kann](/what-it-cannot-do).

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
[Projektarchiv](https://github.com/Le-Space/yoga-p2p) — dort auch alles, was hier
zu klein für ein eigenes Kapitel ist.
