# Screenreader-Empathy — Snapshot vs. Live-DOM Tradeoffs

Two modes exist for running the empathy analysis. Each trades off fidelity
against reach.

## 1. Fetch Tool (snapshot)

**Where**: demo app / standalone page (`vantra-screenreader-empathy/demo/`)

| Aspect | Detail |
|--------|--------|
| Input | HTML string — pasted or fetched via server-side proxy |
| DOM | Parsed with `DOMParser` (browser) or jsdom (Node) |
| Fidelity | Static snapshot. No JS execution, no lazy-loaded content, no CSS-generated text, no `aria-*` set by scripts |
| CORS | Requires server-side proxy for URL fetch; paste always works |
| TTS | Not available in snapshot mode (no live elements to highlight) |
| Highlighting | In-iframe overlay only; no page-level highlighting |
| Use case | Quick audit of remote pages, CI pipelines, design reviews |

### CORS constraint (needs decision)

The demo uses a Vite dev-server plugin (`fetchProxyPlugin`) to bypass CORS.
This only works during `vite dev`. Production options:

1. **Minimal local proxy** — `node server.js` alongside the built demo.
   Simplest. Ships as a `bin` entry or companion script.
2. **Cloudflare Worker proxy** — small Worker on a vantra subdomain.
   Zero-install for users, but adds a network dependency.
3. **Browser extension fetch** — extensions bypass CORS natively, but this
   mode is specifically for non-extension contexts.
4. **Accept the limitation** — paste HTML works everywhere; URL fetch is
   dev-only. Document this clearly.

**Recommendation**: option 1 (local proxy) for self-hosted, option 4 as
documented fallback. Flag to product owner before building.

## 2. Extension Integration (live DOM)

**Where**: Vantra A11y browser extension, "Empathy" tab

| Aspect | Detail |
|--------|--------|
| Input | `document` — the actual live DOM of the current tab |
| DOM | Real rendered page with full JS execution, CSSOM, ARIA |
| Fidelity | Full. Sees everything the browser sees, including script-injected content |
| CORS | Not applicable — content script runs in page context |
| TTS | Web Speech API (`speechSynthesis`). Local, no model download. |
| Highlighting | Direct DOM manipulation — outline + scroll-into-view |
| Use case | Designers/developers experiencing their own page as a screen reader user |

### Why Web Speech API, not Kokoro TTS

The extension CSP enforces `connect-src 'none'`. Kokoro TTS (via
`@vantra-design/local-inference`) needs to download a ~80 MB ONNX model from
HuggingFace on first use. That fetch is blocked by the extension's CSP.

`speechSynthesis` uses the OS-level TTS engine (local, zero network), which:
- Respects the zero-network guarantee
- Requires no model download or initialization
- Works on every platform Chrome supports
- Sounds less natural than Kokoro, but is instant and always available

If higher-quality TTS is needed later, options include:
- Relaxing `connect-src` for HuggingFace origins (breaks the privacy page claim)
- Pre-bundling a smaller TTS model with the extension (increases extension size)
- Offering Kokoro TTS as an opt-in that the user explicitly enables

### Content script bundle size

`@vantra-design/screenreader-empathy/core` adds ~15 KB minified to the content
script IIFE (negligible next to axe-core's ~500 KB). The empathy runner is
bundled into the same `content.js` rather than a separate lazy-loaded script,
keeping injection simple at the cost of a one-time size increase.

## 3. Shared module boundary

```
@vantra-design/screenreader-empathy
├── ./core          ← headless analysis, zero deps
│   ├── analyzeAccessibilityFlow(string | HTMLElement | Document)
│   ├── getStructureReport(TraversalResult)
│   ├── formatEntryForSpeech(TraversalEntry)  ← extracted from browser/
│   └── formatRole(string)
└── .               ← browser features (TTS, highlighting, AI commentary)
    ├── EmpathyPlayback (Kokoro TTS)
    ├── EmpathyCommentary (WebLLM)
    └── highlightElement / clearHighlights
```

`./core` is the shared module consumed by:
- **Demo/fetch tool** — imports `./core` only
- **Extension** — imports `./core` only (uses Web Speech API instead of Kokoro)
- **Standalone browser package** — imports both `./core` and `.`
