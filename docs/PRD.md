# PRD — vantra-a11y-fixer (v0.1 MVP)

Status: Draft für Review · Owner: Vantra Design (vantradesign) · Datum: 2026-08-11

## 1. Problem

Automatisierte A11y-Tools (axe DevTools, Lighthouse, WAVE, AccessCheck, A11yChecks) sagen
Entwickler:innen **was** kaputt ist, aber nicht **welchen konkreten Code sie einsetzen sollen**.
Für Teams ohne A11y-Expertise ist der Weg von „Kontrast 3.1:1 zu niedrig" zu einem
akzeptierten Farbwert manuelle Bastelarbeit. Gleichzeitig ist Datenschutz ein Blocker:
Cloud-gestützte Fix-Generatoren scannen produktive, teils authentifizierte Seiten.

## 2. Lösung (Kernversprechen)

Eine Manifest-V3-Browser-Extension, die Kontrast- und ARIA-Issues erkennt **und pro Issue
einen konkreten, kopierbaren Fix-Vorschlag** generiert — vollständig lokal, ohne Netzwerk-Call.

Nicht-Versprechen (bewusst): **keine Compliance-Zusage.** Automatisierte Prüfung deckt nur
einen Teil der WCAG-Kriterien vollständig ab; wir formulieren „automatisierte Erstkorrektur",
nie „WCAG-konform".

## 3. Zielgruppen & Jobs

| Segment | Job-to-be-done | Erfolg sieht so aus |
| --- | --- | --- |
| Frontend-Dev ohne A11y-Hintergrund | „Zeig mir, was kaputt ist, und gib mir einsetzbaren Code" | Fix-Snippet in < 30 s im Clipboard |
| Design-System-Team (u. a. Vantra) | „Prüfe Komponenten-Library auf systemische Kontrast-/ARIA-Muster" | Issues gruppiert nach wiederkehrendem Muster |
| OSS-Maintainer / QA | „Checks in CI/PR" | v2 (SARIF-Export), **nicht MVP** |

Nicht-Zielgruppen im MVP: Auditor:innen mit Zertifizierungsbedarf, Endnutzer:innen mit
Assistive Technology (das ist kein Screenreader-Ersatz).

## 4. Scope MVP (v0.1–v0.3)

1. **Scan** der aktiven Seite mit axe-core, Tag-Set konfigurierbar (`wcag2a`, `wcag2aa`, `wcag21aa`, `wcag22aa`).
2. **In-Page-Overlay**: farbcodierte Marker auf betroffenen Elementen + Kurz-Tooltip.
3. **Side Panel** mit Übersicht → Issue-Detail → Fix-Vorschlag (Diff-Ansicht).
4. **Regelbasierte Fix-Engine** (kein ML): HSL/OKLCH-Kontrastkorrektur, ARIA-Heuristiken
   (fehlendes `aria-label`/`button-name`/`label`, Rollen-Ableitung aus Elementtyp).
5. **Vorschau anwenden** (temporär im DOM, reversibel) + **Code kopieren** (CSS/HTML-Snippet).
   Kein Schreiben in Projektcode.
6. **Network-Zero-Modus**: verifizierbarer Nachweis, dass keine Requests rausgehen.
7. Chrome/Edge only.

## 5. Explizit out of scope (v2+)

Lokales Vision-Modell (Transformers.js + WebGPU) für Alt-Text-Vorschläge, Hintergrundbild-/
Gradient-Kontrast und natürlichsprachliche Erklärungen · Firefox · CI-Modus (JSON/SARIF) ·
lokale Team-Reports · Auto-Write in Repos.

**Begründung des Cuts:** Der ML-Layer ist das Differenzierungsmerkmal, aber auch das
Hauptrisiko (Modellgröße, Ladezeit, WebGPU-Verfügbarkeit). Das MVP muss ohne ML publizierbar
und nützlich sein, damit früh Sichtbarkeit und Feedback entstehen. Der Fix-Layer wird von
Tag 1 hinter einem `FixProvider`-Interface abstrahiert, damit ML additiv andockt.

## 6. Erfolgsmetriken

| Dimension | Metrik | Ziel 90 Tage |
| --- | --- | --- |
| Adoption | GitHub Stars / Web-Store-Installs | 300 / 500 |
| Vertrauen | Anteil Sessions mit geöffnetem Network-Zero-Panel | ≥ 10 % |
| Wirkung | angewendete oder kopierte Fix-Vorschläge pro Scan | ≥ 1,5 |
| Qualität | manuell gesampelte False-Positive-Rate der Fix-Vorschläge | < 10 % |

Alle Metriken sind **lokal** oder aus öffentlichen Quellen; keine Telemetrie in der Extension.
Wirkungs-/Vertrauensmetriken kommen aus opt-in-freiem, rein lokalem Zähler, den Nutzer:innen
selbst einsehen und optional manuell teilen können.

## 7. Risiken & Gegenmaßnahmen

| Risiko | Gegenmaßnahme |
| --- | --- |
| **Lizenz-Inkompatibilität**: axe-core ist MPL-2.0 *mit Exhibit B* („Incompatible With Secondary Licenses"), nicht MIT. Damit greift MPL §3.3 (Weitergabe eines Larger Work unter GPL) **nicht**. | Entscheidung nötig (siehe `docs/LICENSING-DECISION.md`): MPL-2.0 für Vantra-Code, oder GPL-3.0 + §7-Ausnahme, oder axe-core strikt als unmodifizierte, separat ausgelieferte Datei. |
| Falsche Fix-Vorschläge untergraben Vertrauen | Jeder Vorschlag mit Confidence-Label + WCAG-Referenz; „Anwenden" immer nur als reversible Vorschau |
| Über-Versprechen „Auto-Fix" | Terminologie-Guardrail: „Issue", „Fix-Vorschlag", „Anwenden" (nie „Auto-Fix", „Reparieren", „konform") |
| Overlay bricht komplexe Seiten (Shadow DOM, Canvas, z-index) | Overlay in eigenem Shadow-Root-Container, `pointer-events` gezielt, kein Layout-Eingriff |
| Extension selbst nicht barrierefrei | Dogfooding-Gate: Release erst nach Self-Scan ohne offene AA-Issues |

## 8. Release-Gates

- v0.1: Scan + Overlay + Panel-Übersicht, keine Fixes. Intern.
- v0.2: Kontrast-Fix-Engine + Diff + Copy. Closed Beta.
- v0.3: ARIA-Fix-Heuristiken, Settings, Network-Zero, Self-Scan grün → Web Store + GitHub-Launch.
