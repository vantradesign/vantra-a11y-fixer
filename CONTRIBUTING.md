# Contributing to vantra-a11y-fixer

Thanks for helping make the web more accessible. This project has a few
non-negotiable constraints — please read those first.

## Hard constraints

1. **No network access.** The extension must never make a request at runtime.
   The manifest CSP sets `connect-src 'none'`; ESLint blocks `fetch`,
   `XMLHttpRequest`, `WebSocket` and `EventSource`. Do not work around either.
   The single planned exception is the user-initiated, checksum-verified model
   download in v2, which lives in an isolated offscreen document.
2. **No telemetry.** No analytics, no error reporting service, no remote fonts.
3. **No promises of compliance.** Automated checks cover only a portion of WCAG
   success criteria. UI copy and docs say "fix proposal" and "first-pass
   correction", never "WCAG-compliant" or "auto-fix".
4. **The extension must itself meet WCAG 2.2 AA.** A release is blocked if the
   self-scan reports open AA violations.

## Terminology (enforced in review)

| Use | Avoid |
| --- | --- |
| Issue | error, bug, violation |
| Fix proposal | auto-fix, solution |
| Apply (preview) | repair, fix it |
| Not automatically checkable | passed |

See `docs/IA.md` §1 for the full table, including the German UI strings.

## Setup

```bash
pnpm install
pnpm dev            # builds the extension in watch mode into apps/extension/dist
```

Then load the unpacked extension: `chrome://extensions` → enable Developer
mode → *Load unpacked* → select `apps/extension/dist`.

## Verification before opening a PR

```bash
pnpm verify         # lint + typecheck + unit tests + build
pnpm test:e2e       # Playwright, launches Chromium with the extension loaded
```

## Where code belongs

| Change | Location |
| --- | --- |
| New fix heuristic | `packages/fix-engine/src/providers/` — pure functions, no DOM, no Chrome APIs |
| Colour / contrast maths | `packages/a11y-math/` |
| Message shape between panel and page | `packages/protocol/` (update both sides in the same commit) |
| DOM measuring, overlay, preview | `apps/extension/src/content/` |
| Panel UI | `apps/extension/src/panel/` |

The fix engine is deliberately free of DOM and browser types so it stays unit
testable and reusable from the Vantra CI tooling later.

## Adding a fix provider

1. Add an HTML fixture under `packages/fix-engine/tests/fixtures/` that
   reproduces the issue.
2. Write the failing test first, asserting the expected `FixProposal`.
3. Implement the provider against the `FixProvider` interface.
4. Set `confidence` honestly: `high` only for deterministically computed values,
   `medium` for heuristics, `review` when human judgement is required.

## Reporting a false positive

Open an issue with the URL (or a minimal reproduction), the rule ID and the
proposal that was wrong. False positives are checked in as fixtures **before**
the provider is changed, so the regression cannot come back.

## Licensing of contributions

Contributions are accepted under the **MPL-2.0**, matching the project license.
Do not add dependencies under GPL/AGPL or unclear licenses — see
`LICENSE-THIRD-PARTY.md` for why the combination matters here. Do not add
Exhibit B ("Incompatible With Secondary Licenses") to Vantra-authored files.

## Commits

Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`),
one logical change per commit, PR-sized.
