/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { Rgb } from './color.js'
import { contrastRatio, relativeLuminance, toHex } from './color.js'

/**
 * Verdict on a text/background pair measured from rendered pixels rather than
 * computed from CSS.
 *
 * The background is a *range*, not a colour: text over a gradient, a photo or a
 * decorative stripe sits on many surfaces at once. WCAG has to hold for all of
 * them, so `worstRatio` is what decides, and the two extremes are reported so
 * the number can be checked by eye.
 */
export interface PixelContrast {
  worstRatio: number
  bestRatio: number
  /** Surface yielding `worstRatio`; the colour a fix has to work against. */
  worstBackground: Rgb
  darkestHex: string
  lightestHex: string
  /** Background pixels behind glyphs that the verdict rests on. */
  sampled: number
}

/**
 * Fraction of samples discarded at each end before taking the extremes.
 *
 * A single stray pixel — a border crossing the text box, a caret, one frame of
 * an animation that slipped between the two captures — must not decide a page's
 * verdict. Trimming keeps genuine gradients intact, since those contribute whole
 * populations of pixels rather than isolated ones.
 */
const TRIM = 0.02

/**
 * Fewest background pixels we will judge from.
 *
 * Below this the sample says more about anti-aliasing than about the surface,
 * and staying undecided is the honest answer.
 */
export const MIN_PIXEL_SAMPLES = 16

/**
 * Weighs a text colour against every surface actually found behind its glyphs.
 *
 * Returns `null` when the sample is too thin to carry a verdict — the caller must
 * then leave the finding undecided rather than fall back to a guess.
 */
export function judgePixelContrast(
  backgrounds: readonly Rgb[],
  foreground: Rgb,
  minSamples = MIN_PIXEL_SAMPLES,
): PixelContrast | null {
  if (backgrounds.length < minSamples) return null

  const sorted = [...backgrounds].sort((a, b) => relativeLuminance(a) - relativeLuminance(b))
  const trim = Math.floor(sorted.length * TRIM)
  const darkest = sorted[trim] ?? sorted[0]
  const lightest = sorted[sorted.length - 1 - trim] ?? sorted[sorted.length - 1]
  if (!darkest || !lightest) return null

  const darkRatio = contrastRatio(foreground, darkest)
  const lightRatio = contrastRatio(foreground, lightest)

  return {
    worstRatio: Math.min(darkRatio, lightRatio),
    bestRatio: Math.max(darkRatio, lightRatio),
    worstBackground: darkRatio <= lightRatio ? darkest : lightest,
    darkestHex: toHex(darkest),
    lightestHex: toHex(lightest),
    sampled: backgrounds.length,
  }
}
