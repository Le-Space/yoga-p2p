---
title: Was die App nicht kann
sidebar_position: 20
---

# Was die App nicht kann

Ehrlicher als es zu verschweigen. Nichts davon ist ein Fehler, der noch behoben
wird — es sind die Kehrseiten davon, ohne Server zu arbeiten.

## Doppelte Entwertung ist erkennbar, nicht verhinderbar

Zwei Theken ohne Verbindung können dieselbe Stunde entwerten. Ohne einen
zentralen Rechner, der beide fragt, geht das nicht anders.

Was die App stattdessen tut: Sie **zeigt** den Widerspruch, sobald die Einträge
zusammenkommen, mit beiden Belegen. Das Guthaben wird dabei genau einmal
belastet — ein Widerspruch verschenkt nie eine Stunde und kostet nie zwei.

Der Schaden pro Vorfall ist eine Yogastunde. Dafür gibt es keinen Server.

## Wer eine Adresse kennt, kann mitlesen

Die zugrunde liegende Datenbank kennt **Schreibrechte**, aber keine Leserechte.
Wer die Adresse einer Datenbank kennt und ein Gerät erreicht, das sie hat, kann
sie vollständig lesen.

Praktisch heißt das: Eure Kartenkonten liegen bei euch und auf den Geräten eures
Studios, und keine dieser Adressen wird verteilt. Aber es ist eine Frage der
Verteilung, nicht eine erzwungene Schranke.

Vollständig aufgeschlüsselt in der
[Datenschutz-Analyse](https://github.com/Le-Space/yoga-p2p/blob/main/docs/PRIVACY.md).

## Auf dem Gerät ist nichts verschlüsselt

Wer ein **entsperrtes** Studio-Gerät in die Hand bekommt, liest alles, was darauf
ist. Kein Passkey nötig.

Für das iPad an der Rezeption ist das der realistischste Weg, an Daten zu kommen
— nicht das Netzwerk. Sperrbildschirm und Geräteverschlüsselung sind hier
wichtiger als alles, was die App tun könnte.

## Manche Verbindungen kommen über die Ferne nicht zustande

Manche Internetanschlüsse lassen zwei Geräte nicht direkt zueinander. Es gäbe
Hilfsserver dafür; die App benutzt bewusst keine, weil sie den Datenverkehr
sähen. Im Studio, im selben Netz, tritt der Fall nicht auf.

## Kein Löschen im eigentlichen Sinn

Einträge werden angehängt, nie überschrieben — daher stimmen die Zahlen. Eine
Karte kann storniert werden, aber ihre Geschichte bleibt lesbar.

Für eine Löschanfrage nach DSGVO gibt es damit noch kein fertiges Verfahren. Das
ist offen und im Repository als offen vermerkt.

## Es gibt niemanden, der euch aushilft

Kein Anbieter, kein Passwort-Zurücksetzen, keine Wiederherstellung. Deshalb:

- ein **Zweitgerät** im Studio, von Anfang an
- regelmäßig **exportieren**
- Passkeys dort aufbewahren, wo sie mitsynchronisiert werden
