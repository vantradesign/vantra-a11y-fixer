# vantra-a11y-fixer

> Find contrast and ARIA issues on any page — and get a concrete fix proposal for
> each one. Entirely local. No network calls, no telemetry, no account.

[![CI](https://github.com/vantradesign/vantra-a11y-fixer/actions/workflows/ci.yml/badge.svg)](https://github.com/vantradesign/vantra-a11y-fixer/actions/workflows/ci.yml)
[![License: MPL-2.0](https://img.shields.io/badge/license-MPL--2.0-021f94)](LICENSE)

Existing accessibility extensions tell you *what* is broken. `vantra-a11y-fixer`
also tells you *what to write instead* — a computed colour value, a suggested
`aria-label`, a corrected label association — and lets you preview it on the live
page before you copy the snippet into your codebase.

## Status

**Pre-release (v0.1, in development).** Not yet published to the Chrome Web Store.

| Milestone | Contents | State |
| --- | --- | --- |
| v0.1 | axe-core scan, in-page overlay, panel overview | in progress |
| v0.2 | contrast fix engine, diff view, copy snippet | planned |
| v0.3 | ARIA heuristics, settings, network-zero proof | planned |
| v2 | local vision model (alt text), Firefox, CI/SARIF export | later |

## What it does

- **Detects** using [axe-core](https://github.com/dequelabs/axe-core), the de-facto
  standard engine, with a configurable target level (`wcag2a` … `wcag22aa`).
- **Groups** findings into four user-facing categories — Contrast, Semantics &
  ARIA, Structure, Interaction — plus an explicit *needs manual review* bucket.
  Repeated occurrences that share one fix are clustered into a single card
  ("12 elements, 1 fix proposal") — the useful view for design-system teams.
- **Proposes** fixes deterministically where possible: contrast corrections are
  computed in OKLCH so hue and chroma stay intact while lightness moves just far
  enough to clear the target ratio.
- **Measures** contrast that CSS cannot answer. Where text sits on a gradient,
  an image or a pseudo element, axe has to give up — the surface simply is not
  readable from the cascade. The extension then photographs the viewport twice,
  once with and once without the text fill, and reads the background at the text
  pixels themselves. Findings it settles are reported as measured, with the
  colour it found, so the number can be checked rather than believed.
- **Previews** a proposal temporarily in the DOM, fully reversible. It never
  writes to your source files.

## What it deliberately does not do

- It does not claim WCAG compliance. Automated tooling can only fully verify a
  portion of the success criteria; the rest needs human judgement. We call this
  "first-pass correction", and we label everything that needs a human.
- It does not auto-apply anything, and it does not touch your repository.
- It does not send a single byte anywhere. The manifest sets
  `connect-src 'none'`, so the browser itself enforces this — you can verify it
  in the *Network-Zero* panel section rather than taking our word for it.
- It does not keep the screenshots it takes. Contrast measurement captures the
  visible area, reads it in memory and discards it; nothing is written to disk
  and, per the rule above, nothing could be sent anywhere even if it were. The
  measurement can be switched off in the settings.

## Install from source

```bash
pnpm install
pnpm build
```

Then in Chrome or Edge: `chrome://extensions` → enable Developer mode →
*Load unpacked* → select `apps/extension/dist`.

## Documentation

| Document | Contents |
| --- | --- |
| [`docs/PRD.md`](docs/PRD.md) | Problem, scope cut, success metrics, risks |
| [`docs/IA.md`](docs/IA.md) | Issue taxonomy, sitemap, flows, wireframes, terminology rules |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Components, data model, fix engine, privacy architecture |
| [`docs/LICENSING-DECISION.md`](docs/LICENSING-DECISION.md) | Why MPL-2.0 and not GPL-3.0 |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Setup, hard constraints, how to add a fix provider |

## License

MPL-2.0 — see [`LICENSE`](LICENSE). Note that axe-core is **MPL-2.0 with
Exhibit B**, not MIT as is often assumed; [`LICENSE-THIRD-PARTY.md`](LICENSE-THIRD-PARTY.md)
explains why that ruled out a GPL-3.0 license for this project.
