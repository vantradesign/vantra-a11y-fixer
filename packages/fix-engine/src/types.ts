/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type {
  Category,
  ElementRect,
  FixProposal,
  Settings,
  WcagLevel,
} from '@vantra-a11y/protocol'
import type { TargetBox } from '@vantra-a11y/math'

/**
 * A DOM-free description of one axe finding. The content script measures the
 * page and fills this in; everything downstream is pure computation, which is
 * what keeps the engine testable and reusable outside a browser.
 */
export interface NormalizedIssue {
  ruleId: string
  category: Category
  selector: string
  html: string
  /** Bounding box measured by the content script, used to place the overlay. */
  rect: ElementRect
  /** axe's own help text, used only as a fallback title for unmapped rules. */
  title?: string
  /** Tag name, lower case, e.g. `button`. */
  tagName: string
  attributes: Record<string, string>
  /** Trimmed visible text content of the element. */
  visibleText: string
  /** Text of nearby candidate label elements, nearest first. */
  nearbyText: string[]
  contrast?: {
    foreground: string
    background: string
    fontSizePx: number
    bold: boolean
    /** axe could not determine the colours (background image, gradient, …). */
    indeterminate: boolean
    /**
     * Where `background` came from. `pixel` means it was read off the rendered
     * page rather than computed from CSS, which the proposal must disclose — the
     * user cannot check a number whose origin is hidden.
     */
    backgroundSource?: 'axe' | 'pixel'
    /**
     * Lightest and darkest surface found behind the glyphs, as hex. Present only
     * for `pixel`, and only when the two differ — that spread is what makes the
     * background a range rather than a colour.
     */
    backgroundRange?: { lightest: string; darkest: string }
  }
  /**
   * Layout facts for interaction-size rules. Present only for the rules that need
   * them, so measuring stays opt-in rather than a cost on every finding.
   */
  box?: TargetBox
  /**
   * The element is an inline box sitting inside a run of text — the shape WCAG
   * 2.5.8 explicitly excepts, and where enlarging the target would break the
   * paragraph it lives in.
   */
  inlineInTextFlow?: boolean
  /** axe reported this as "incomplete" rather than a definite violation. */
  incomplete: boolean
  /**
   * axe's own reason for declining, e.g. `pseudoContent` or `bgImage`.
   *
   * Without it every undecided finding collapses into one indistinguishable
   * heap, and the guidance can only say "check manually" — which tells the user
   * nothing they did not already know. The reason usually points at a single CSS
   * pattern behind hundreds of occurrences.
   */
  incompleteReason?: string
}

export interface FixContext {
  targetLevel: WcagLevel
  settings: Settings
  /**
   * `lang` of the audited document. Proposed accessible names are written into
   * that page, so they follow its language rather than the browser UI locale.
   */
  pageLang?: string
  /** Deterministic ID factory, so proposal IDs are stable across scans. */
  nextId: (prefix: string) => string
}

export interface FixProvider {
  readonly id: string
  supports(issue: NormalizedIssue): boolean
  propose(issue: NormalizedIssue, ctx: FixContext): FixProposal[]
}
