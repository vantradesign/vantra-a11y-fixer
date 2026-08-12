/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { NormalizedIssue } from '@vantra-a11y/fix-engine'
import { requiredRatio, toHex } from '@vantra-a11y/math'
import type { Settings } from '@vantra-a11y/protocol'

import type { ProbeOptions, ProbeTarget } from './pixel-probe.js'
import { probeContrast } from './pixel-probe.js'

const CONTRAST_RULES = new Set(['color-contrast', 'color-contrast-enhanced'])

export interface MeasureOutcome {
  issues: NormalizedIssue[]
  /**
   * Findings the measurement showed to be sufficient, and which are therefore
   * gone from `issues`. Counted so the panel can account for them: a finding that
   * vanishes without a word is indistinguishable from one that was lost.
   */
  cleared: number
}

/** Findings axe left undecided purely because it could not see the background. */
const isUndecidedContrast = (issue: NormalizedIssue): boolean =>
  issue.incomplete && CONTRAST_RULES.has(issue.ruleId) && issue.contrast?.indeterminate === true

/**
 * Settles undecided contrast findings against the rendered page.
 *
 * Three outcomes per finding, and the distinction matters:
 *
 * - measured and sufficient — dropped, counted in `cleared`
 * - measured and insufficient — becomes an ordinary contrast finding, so the
 *   existing provider can propose a correction against the surface we measured
 * - not measurable — left exactly as it was, undecided, with axe's own reason
 *
 * Nothing is inferred for the third group. A finding we could not measure keeps
 * saying so.
 */
export async function measureContrast(
  issues: readonly NormalizedIssue[],
  settings: Settings,
  options: ProbeOptions,
): Promise<MeasureOutcome> {
  const candidates = issues.filter(isUndecidedContrast)
  if (candidates.length === 0) return { issues: [...issues], cleared: 0 }

  const targets: ProbeTarget[] = candidates.map((issue) => ({
    selector: issue.selector,
    rect: issue.rect,
    foreground: issue.contrast!.foreground,
  }))

  const verdicts = await probeContrast(targets, options)
  if (verdicts.size === 0) return { issues: [...issues], cleared: 0 }

  const result: NormalizedIssue[] = []
  let cleared = 0

  for (const issue of issues) {
    const verdict = isUndecidedContrast(issue) ? verdicts.get(issue.selector) : undefined
    const contrast = issue.contrast

    if (!verdict || !contrast) {
      result.push(issue)
      continue
    }

    const level = issue.ruleId === 'color-contrast-enhanced' ? 'AAA' : settings.targetLevel
    const required = requiredRatio(level, {
      fontSizePx: contrast.fontSizePx,
      bold: contrast.bold,
    })

    if (verdict.worstRatio >= required) {
      cleared += 1
      continue
    }

    result.push({
      ...issue,
      incomplete: false,
      incompleteReason: undefined,
      contrast: {
        ...contrast,
        // The worst surface behind the glyphs: fix against that and every other
        // surface under the same text is covered too.
        background: toHex(verdict.worstBackground),
        indeterminate: false,
        backgroundSource: 'pixel',
        backgroundRange:
          verdict.darkestHex === verdict.lightestHex
            ? undefined
            : { lightest: verdict.lightestHex, darkest: verdict.darkestHex },
      },
    })
  }

  return { issues: result, cleared }
}
