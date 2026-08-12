/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * User-facing category. Deliberately not the axe rule ID: developers without an
 * accessibility background navigate by consequence ("text is unreadable"), not
 * by rule taxonomy. See docs/IA.md §2.
 */
export type Category = 'contrast' | 'semantics' | 'structure' | 'interaction' | 'manual'

export type Severity = 'critical' | 'high' | 'medium' | 'advisory' | 'manual'

/**
 * How much to trust a proposal.
 * - `high`   — deterministically computed, verifiable (e.g. a solved contrast value)
 * - `medium` — heuristic with a good signal (e.g. an accessible name from visible text)
 * - `review` — needs human judgement; we show it as a starting point only
 */
export type Confidence = 'high' | 'medium' | 'review'

export type WcagLevel = 'A' | 'AA' | 'AAA'

/**
 * A piece of user-facing text, as a catalog key plus its substitutions.
 *
 * The analysis layer never produces prose. It runs in the content script while
 * the text is rendered in the panel, and both are `chrome.i18n` consumers with
 * their own locale — resolving early would bake one language into the wire
 * format and into every cached scan result. Keys are resolved at the last
 * possible moment, in the component that displays them.
 *
 * `args` maps onto `chrome.i18n.getMessage(key, substitutions)`, so a catalog
 * entry uses `$1`…`$9` placeholders.
 */
export interface LocalizedText {
  key: string
  args?: string[]
}

export interface WcagReference {
  /** Success criterion number, e.g. `1.4.3`. */
  sc: string
  level: WcagLevel
  /** Catalog key for the plain-language title of the success criterion. */
  title: LocalizedText
}

export interface ElementRect {
  x: number
  y: number
  w: number
  h: number
}

export interface IssueOccurrence {
  /** Unique CSS path, stable enough to re-resolve the element after a re-render. */
  selector: string
  /** Truncated outer HTML, for display only. */
  html: string
  rect: ElementRect
}

/**
 * Sentinels for `FixProposal.before` / `.after` cells that describe an absence
 * rather than a value. They are markers, not display strings: the diff table
 * renders them through the message catalog, so "(missing)" is never baked into
 * the wire format.
 */
export const DIFF_ABSENT = '@@vantra:absent'
export const DIFF_REMOVED = '@@vantra:removed'

export interface FixProposal {
  id: string
  kind: 'css' | 'attribute' | 'markup'
  confidence: Confidence
  /** Short label for the proposal, e.g. "Darken the text". */
  label: LocalizedText
  /** Why this value — shown to the user, so the catalog entry must be plain language. */
  rationale: LocalizedText
  before: Record<string, string>
  after: Record<string, string>
  snippet: { css?: string; html?: string }
  metrics?: {
    contrastBefore: number
    contrastAfter: number
    requiredRatio: number
  }
  /** Proposal text the user may edit before copying (accessible names). */
  editable?: boolean
}

export interface IssueCluster {
  id: string
  /** axe rule ID, kept for traceability and bug reports. */
  ruleId: string
  category: Category
  severity: Severity
  wcag: WcagReference
  /** User-facing title, not the axe wording. */
  title: LocalizedText
  explanation: LocalizedText
  occurrences: IssueOccurrence[]
  /** Empty means: no automated proposal — `manualGuidance` must then be set. */
  proposals: FixProposal[]
  manualGuidance?: LocalizedText
}

export interface ScanResult {
  url: string
  scannedAt: number
  targetLevel: WcagLevel
  axeVersion: string
  elementCount: number
  clusters: IssueCluster[]
  /**
   * Count of axe "incomplete" results — things that could not be determined
   * automatically. Surfaced prominently so a clean scan is never mistaken for
   * a compliance statement.
   */
  needsManualReview: number
  /**
   * How many findings axe left undecided but the pixel measurement settled as
   * sufficient, and which are therefore absent from `clusters`.
   *
   * Reported because silently dropping findings would be indistinguishable from
   * losing them. The user has to be able to see that something was decided on
   * their behalf, and on what grounds.
   */
  pixelCleared?: number
}

export const SEVERITY_ORDER: readonly Severity[] = [
  'critical',
  'high',
  'medium',
  'advisory',
  'manual',
]

export function compareSeverity(a: Severity, b: Severity): number {
  return SEVERITY_ORDER.indexOf(a) - SEVERITY_ORDER.indexOf(b)
}
