/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { FixProposal } from '@vantra-a11y/protocol'
import { requiredTargetSize, solveTargetSize } from '@vantra-a11y/math'

import { text } from '../text.js'
import type { FixProvider } from '../types.js'

const TARGET_RULES = new Set(['target-size'])

const px = (value: number): string => `${Math.round(value * 100) / 100}px`

/**
 * Enlarges click and touch targets that fall below the WCAG minimum.
 *
 * Two routes are offered because they fail differently:
 *
 * - `min-width`/`min-height` always produces a box of at least the required size,
 *   but can push siblings around in a tight layout.
 * - Extra padding grows the target from the inside and usually looks better, but
 *   has no effect on a `border-box` element with an explicit width — hence the
 *   lower confidence.
 *
 * Declines entirely for inline elements inside running text: WCAG 2.5.8 excepts
 * them, and enlarging a link in the middle of a sentence would wreck the
 * paragraph's line spacing to satisfy a criterion that was never violated.
 */
export const targetSizeFixProvider: FixProvider = {
  id: 'target-size',

  supports(issue) {
    if (!TARGET_RULES.has(issue.ruleId)) return false
    if (issue.inlineInTextFlow === true) return false

    const box = issue.box
    // A zero-sized box means the element is hidden or not laid out; there is
    // nothing meaningful to compute from.
    return box !== undefined && box.widthPx > 0 && box.heightPx > 0
  },

  propose(issue, ctx) {
    const box = issue.box
    if (!box) return []

    const required = requiredTargetSize(ctx.targetLevel)
    const solution = solveTargetSize(box, required)
    if (solution.meetsAlready) return []

    const proposals: FixProposal[] = []

    const declarations = [
      `min-width: ${px(solution.minWidthPx)}`,
      `min-height: ${px(solution.minHeightPx)}`,
    ]
    // `min-*` is ignored on non-replaced inline boxes, so the display change is
    // part of the fix rather than a nice-to-have.
    if (solution.needsDisplayChange) declarations.unshift('display: inline-block')

    proposals.push({
      id: ctx.nextId('target-min-size'),
      kind: 'css',
      confidence: 'high',
      label: text('fixTargetMinSizeLabel', String(required)),
      rationale: text(
        solution.needsDisplayChange
          ? 'fixTargetMinSizeRationaleInlineBlock'
          : 'fixTargetMinSizeRationale',
        px(box.widthPx),
        px(box.heightPx),
      ),
      before: {
        width: px(box.widthPx),
        height: px(box.heightPx),
        ...(solution.needsDisplayChange ? { display: box.display } : {}),
      },
      after: {
        'min-width': px(solution.minWidthPx),
        'min-height': px(solution.minHeightPx),
        ...(solution.needsDisplayChange ? { display: 'inline-block' } : {}),
      },
      snippet: {
        css: `${issue.selector} {\n${declarations.map((entry) => `  ${entry};`).join('\n')}\n}`,
      },
    })

    const { inline, block } = solution.paddingDeltaPx
    if (inline > 0 || block > 0) {
      const after = solution.paddingAfterPx
      proposals.push({
        id: ctx.nextId('target-padding'),
        kind: 'css',
        confidence: 'medium',
        label: text('fixTargetPaddingLabel'),
        // Stating the resulting padding rather than the delta keeps this to two
        // catalog entries instead of one per "unchanged axis" combination — and
        // the absolute value is what actually goes into the stylesheet.
        rationale: text(
          box.boxSizing === 'border-box'
            ? 'fixTargetPaddingRationaleBorderBox'
            : 'fixTargetPaddingRationale',
          px(after.top),
          px(after.left),
        ),
        before: {
          padding: `${px(box.paddingPx.top)} ${px(box.paddingPx.right)} ${px(box.paddingPx.bottom)} ${px(box.paddingPx.left)}`,
        },
        after: {
          padding: `${px(after.top)} ${px(after.right)} ${px(after.bottom)} ${px(after.left)}`,
        },
        snippet: {
          css: `${issue.selector} {\n  padding: ${px(after.top)} ${px(after.right)} ${px(after.bottom)} ${px(after.left)};\n}`,
        },
      })
    }

    return proposals
  },
}
