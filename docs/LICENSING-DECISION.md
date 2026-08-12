# Lizenz-Entscheidung — ENTSCHIEDEN: Option A (MPL-2.0)

> **Status:** abgeschlossen und umgesetzt. Alle Vantra-Pakete führen `MPL-2.0`.
> Dieses Dokument bleibt als Entscheidungsprotokoll bestehen.
>
> **Korrektur:** Die ursprüngliche Exhibit-B-Argumentation unten war falsch —
> siehe „Nachtrag". Die Entscheidung für MPL-2.0 bleibt davon unberührt, ihre
> Begründung ist aber eine andere.

## Befund: Die Annahme im Kickoff ist faktisch falsch

Der Kickoff nimmt an, axe-core sei **MIT** und damit unproblematisch mit GPL-3.0 kombinierbar.
Tatsächlich gilt:

- axe-core ist unter der **Mozilla Public License 2.0** veröffentlicht.

~~Die `LICENSE`-Datei enthält **Exhibit B — „Incompatible With Secondary Licenses"**.~~
**Diese Aussage ist widerlegt, siehe Nachtrag am Ende.**

~~Konsequenz: MPL-2.0 §3.3 erlaubt normalerweise, ein „Larger Work" unter einer Secondary
License (GPL/LGPL/AGPL) weiterzugeben. **Exhibit B entzieht genau diese Erlaubnis.**~~

## Optionen

### A) Vantra-Code unter MPL-2.0 (empfohlen)

- Volle Kompatibilität mit axe-core, gleiche Copyleft-Philosophie auf Datei-Ebene.
- Copyleft-Signal bleibt erhalten: Änderungen an Vantra-Dateien müssen offen bleiben.
- Schwächer als GPL bei Einbettung in proprietäre Larger Works — für eine Extension
  praktisch kaum relevant, da Distribution ohnehin über den Store als Ganzes läuft.
- Konsistenzbruch zum restlichen Vantra-Portfolio (`AGPL-3.0-only`) — aber der
  AGPL-Netzwerk-Paragraf ist für eine reine Client-Extension ohnehin wirkungslos.

### B) GPL-3.0 + Additional-Permission-Ausnahme nach GPL §7

- `LICENSE-EXCEPTION.md`: explizite Erlaubnis, das Werk mit MPL-2.0-Code
  (auch mit Exhibit B) zu verlinken und zu distribuieren.
- Behält das gewünschte GPL-Signal, ist aber juristisch erklärungsbedürftig und
  erhöht die Hürde für Contributions (CLA-/Copyright-Fragen).

### C) axe-core strikt getrennt ausliefern

- axe-core als unmodifizierte, separate `vendor/axe.min.js` mit eigenem Lizenz-Header,
  zur Laufzeit injiziert, nie in den Vantra-Bundle gebundlet.
- Erlaubt die GPL-Argumentation „getrennte Werke", bleibt aber eine Auslegungsfrage
  und wird in der Community regelmäßig bestritten.

### D) Andere Erkennungs-Engine

- Eigene Regel-Implementierung oder IBM `equal-access` (Apache-2.0).
- Sauber GPL-kompatibel, kostet aber die Glaubwürdigkeit und Abdeckung von axe-core.
  Nicht empfohlen fürs MVP.

## Entscheidung

**Option A (MPL-2.0)** — umgesetzt für v0.1:

- Root, `apps/extension` und alle drei `packages/*` führen `"license": "MPL-2.0"`.
- Jede Vantra-Quelldatei trägt den Exhibit-A-Header.
- `LICENSE-THIRD-PARTY.md` nennt axe-core korrekt als **`MPL-2.0`** (ohne Exhibit B)
  statt der falschen MIT-Angabe.
- Der axe-core-Copyright-Banner wird im gebündelten `content.js` über
  `output.banner` erhalten — das fordert axe-core ausdrücklich.

**Offen:** Ein CI-Gate `license-check`, das Abhängigkeiten mit unklaren Lizenzen
blockiert, ist beschrieben, aber **nicht gebaut** — das Repository hat derzeit
keine CI-Workflows.

## Nachtrag: Exhibit B trifft auf axe-core nicht zu

Die Prüfung des tatsächlich installierten Artefakts (axe-core 4.13.0) widerlegt die
Ausgangsthese:

- Die `LICENSE` von axe-core ist die **wörtliche MPL-2.0-Vorlage**. Jede wörtliche
  Kopie endet mit den *unangehängten* Muster-Notices Exhibit A und Exhibit B —
  unsere eigene `LICENSE` enthält denselben Exhibit-B-Text. Das Vorkommen in einer
  Lizenzdatei beweist also nichts.
- Exhibit B wirkt erst, wenn die Notice **an den Dateien angebracht** ist. Der
  Banner in `axe.js` ist die schlichte Exhibit-A-Notice ohne „Incompatible With
  Secondary Licenses".

axe-core ist damit schlichtes **`MPL-2.0`**, `package.json` ist korrekt, und §3.3
bleibt verfügbar. GPL-3.0/AGPL-3.0 wären also **nicht** durch axe-core blockiert
gewesen. MPL-2.0 bleibt trotzdem die Wahl: gleiche Lizenz auf Dateiebene, keine
§3.3-Argumentation nötig.

Diese Entscheidung ist keine Rechtsberatung; sie dokumentiert die technische Faktenlage
für eine bewusste Wahl. Bei kommerzieller Relevanz vor dem Launch anwaltlich prüfen lassen.
