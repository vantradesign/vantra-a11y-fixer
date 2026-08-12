/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { FixProposal } from '@vantra-a11y/protocol'
import {
  composite,
  contrastRatio,
  parseColor,
  requiredRatio,
  solveContrast,
  solveContrastFromPalette,
  toHex,
} from '@vantra-a11y/math'
import type { Rgb } from '@vantra-a11y/math'

import { text } from '../text.js'
import type { FixContext, FixProvider, NormalizedIssue } from '../types.js'

const CONTRAST_RULES = new Set(['color-contrast', 'color-contrast-enhanced'])

const format = (ratio: number): string => `${ratio.toFixed(2)}:1`

function proposalFor(
  issue: NormalizedIssue,
  ctx: FixContext,
  adjustable: Rgb,
  fixed: Rgb,
  target: 'foreground' | 'background',
  required: number,
): FixProposal | null {
  const solution = solveContrast(adjustable, fixed, required, target)
  if (!solution.reachesTarget) return null
  if (solution.lightnessDeltaPct === 0) return null

  const property = target === 'foreground' ? 'color' : 'background-color'
  const darker = solution.lightnessDeltaPct < 0
  const delta = Math.abs(solution.lightnessDeltaPct).toFixed(1)
  const contrast = issue.contrast
  const labelKey =
    target === 'foreground'
      ? darker
        ? 'fixContrastDarkenText'
        : 'fixContrastLightenText'
      : darker
        ? 'fixContrastDarkenBackground'
        : 'fixContrastLightenBackground'

  // A measured background has to say so. The user can re-check a CSS value in
  // devtools; a number read off pixels is only trustworthy if its origin, and the
  // spread it came from, are on the card.
  const rationale =
    contrast?.backgroundSource === 'pixel'
      ? contrast.backgroundRange
        ? text(
            'fixContrastRationalePixelRange',
            delta,
            format(required),
            contrast.backgroundRange.darkest,
            contrast.backgroundRange.lightest,
          )
        : // Deliberately not `fixed`: that is the foreground when the background
          // is the side being adjusted. The measured surface is on the issue.
          text('fixContrastRationalePixel', delta, format(required), contrast.background)
      : text('fixContrastRationale', delta, format(required))

  return {
    id: ctx.nextId(`contrast-${target}`),
    kind: 'css',
    confidence: 'high',
    label: text(labelKey),
    rationale,
    before: { [property]: toHex(adjustable) },
    after: { [property]: solution.hex },
    snippet: { css: `${issue.selector} {\n  ${property}: ${solution.hex};\n}` },
    metrics: {
      contrastBefore: solution.ratioBefore,
      contrastAfter: solution.ratioAfter,
      requiredRatio: required,
    },
  }
}

/**
 * Deterministic contrast correction. Both directions (adjust text / adjust
 * background) are offered, ordered by the user's preference, because which one
 * is acceptable is a design decision we must not make for them.
 *
 * Declines to propose anything when axe could not resolve the colour pair —
 * background images, gradients and `currentColor` produce confidently wrong
 * numbers otherwise. Those cases are handed to the manual-guidance path and are
 * the motivating use case for the v2 vision layer.
 */
export const contrastFixProvider: FixProvider = {
  id: 'contrast',

  supports(issue) {
    return (
      CONTRAST_RULES.has(issue.ruleId) &&
      issue.contrast !== undefined &&
      !issue.contrast.indeterminate
    )
  },

  propose(issue, ctx) {
    const contrast = issue.contrast
    if (!contrast) return []

    const fgRaw = parseColor(contrast.foreground)
    const bgRaw = parseColor(contrast.background)
    if (!fgRaw || !bgRaw) return []

    const bg = { ...bgRaw, a: 1 }
    const fg = composite(fgRaw, bg)

    const level = issue.ruleId === 'color-contrast-enhanced' ? 'AAA' : ctx.targetLevel
    const required = requiredRatio(level, {
      fontSizePx: contrast.fontSizePx,
      bold: contrast.bold,
    })

    if (contrastRatio(fg, bg) >= required) return []

    const proposals: FixProposal[] = []

    if (ctx.settings.fixPreferences.snapToPalette) {
      const palette = ctx.settings.fixPreferences.palette
        .map((hex) => parseColor(hex))
        .filter((color): color is Rgb => color !== null)
      const snapped = solveContrastFromPalette(palette, bg, required, fg)
      if (snapped) {
        proposals.push({
          id: ctx.nextId('contrast-token'),
          kind: 'css',
          confidence: 'medium',
          label: text('fixContrastPaletteLabel'),
          rationale: text('fixContrastPaletteRationale'),
          before: { color: toHex(fg) },
          after: { color: toHex(snapped) },
          snippet: { css: `${issue.selector} {\n  color: ${toHex(snapped)};\n}` },
          metrics: {
            contrastBefore: contrastRatio(fg, bg),
            contrastAfter: contrastRatio(snapped, bg),
            requiredRatio: required,
          },
        })
      }
    }

    // A measured background is a photograph, not a declaration. There is no
    // `background-color` to rewrite — the gradient, image or pseudo element would
    // keep painting over whatever we set — so only the text can be corrected.
    const order: Array<'foreground' | 'background'> =
      contrast.backgroundSource === 'pixel'
        ? ['foreground']
        : ctx.settings.fixPreferences.preferAdjusting === 'background'
          ? ['background', 'foreground']
          : ['foreground', 'background']

    for (const target of order) {
      const proposal =
        target === 'foreground'
          ? proposalFor(issue, ctx, fg, bg, 'foreground', required)
          : proposalFor(issue, ctx, bg, fg, 'background', required)
      if (proposal) proposals.push(proposal)
    }

    return proposals
  },
}
