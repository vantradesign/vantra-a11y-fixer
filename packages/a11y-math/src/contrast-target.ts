/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { Rgb } from './color.js'
import { contrastRatio, oklchToRgb, rgbToOklch, toHex } from './color.js'

export type WcagLevel = 'A' | 'AA' | 'AAA'

export interface TextContext {
  /** Computed font size in CSS pixels. */
  fontSizePx: number
  /** `true` for 700+ / bold. */
  bold: boolean
}

/**
 * WCAG 2.x treats 18pt (24px) regular or 14pt (18.67px) bold as "large text",
 * which lowers the required ratio. Getting this wrong is the single most common
 * source of over-eager contrast proposals, so it lives in one place.
 */
export function isLargeText({ fontSizePx, bold }: TextContext): boolean {
  return fontSizePx >= 24 || (bold && fontSizePx >= 18.67)
}

/** Required ratio for SC 1.4.3 (AA) / 1.4.6 (AAA). Level A has no ratio requirement. */
export function requiredRatio(level: WcagLevel, text: TextContext): number {
  if (level === 'A') return 1
  const large = isLargeText(text)
  if (level === 'AAA') return large ? 4.5 : 7
  return large ? 3 : 4.5
}

export type AdjustTarget = 'foreground' | 'background'

export interface ContrastSolution {
  target: AdjustTarget
  /** The adjusted colour, as an opaque hex value ready to paste into CSS. */
  hex: string
  rgb: Rgb
  ratioBefore: number
  ratioAfter: number
  requiredRatio: number
  /** Signed OKLCH lightness delta in percentage points, for the diff view. */
  lightnessDeltaPct: number
  /** `false` when even a pure black/white adjustment cannot reach the target. */
  reachesTarget: boolean
}

const EPSILON = 1e-4

/**
 * Finds the smallest OKLCH lightness change that reaches `required`, keeping hue
 * and chroma untouched so the result still reads as the same brand colour.
 *
 * Direction is chosen by moving *away* from the fixed colour's luminance: dark
 * text on light background gets darker, not lighter. Contrast is monotonic in
 * that direction, which makes a binary search exact and cheap — no sampling, no
 * guessing, hence `confidence: 'high'` on the resulting proposal.
 */
export function solveContrast(
  adjustable: Rgb,
  fixed: Rgb,
  required: number,
  target: AdjustTarget,
): ContrastSolution {
  const ratioBefore = contrastRatio(adjustable, fixed)
  const startOklch = rgbToOklch(adjustable)

  const base = {
    target,
    requiredRatio: required,
    ratioBefore,
  }

  if (ratioBefore >= required) {
    return {
      ...base,
      hex: toHex(adjustable),
      rgb: adjustable,
      ratioAfter: ratioBefore,
      lightnessDeltaPct: 0,
      reachesTarget: true,
    }
  }

  // Move towards whichever extreme is further from the fixed colour.
  const goDarker = contrastRatio({ r: 0, g: 0, b: 0, a: 1 }, fixed) > contrastRatio({ r: 255, g: 255, b: 255, a: 1 }, fixed)
  const extremeL = goDarker ? 0 : 1

  const at = (l: number): Rgb => oklchToRgb({ ...startOklch, l, a: 1 })
  const bestPossible = contrastRatio(at(extremeL), fixed)

  if (bestPossible < required) {
    const rgb = at(extremeL)
    return {
      ...base,
      hex: toHex(rgb),
      rgb,
      ratioAfter: bestPossible,
      lightnessDeltaPct: (extremeL - startOklch.l) * 100,
      reachesTarget: false,
    }
  }

  let lo = startOklch.l
  let hi = extremeL
  for (let i = 0; i < 40 && Math.abs(hi - lo) > EPSILON; i += 1) {
    const mid = (lo + hi) / 2
    if (contrastRatio(at(mid), fixed) >= required) {
      hi = mid
    } else {
      lo = mid
    }
  }

  const rgb = at(hi)
  return {
    ...base,
    hex: toHex(rgb),
    rgb,
    ratioAfter: contrastRatio(rgb, fixed),
    lightnessDeltaPct: (hi - startOklch.l) * 100,
    reachesTarget: true,
  }
}

/**
 * Snaps to the closest colour in an allowed palette that still clears the target
 * ratio — the variant design-system teams want, because it keeps tokens intact.
 * Returns `null` when no palette entry qualifies; the caller then falls back to
 * the computed value and downgrades confidence accordingly.
 */
export function solveContrastFromPalette(
  palette: readonly Rgb[],
  fixed: Rgb,
  required: number,
  reference: Rgb,
): Rgb | null {
  const referenceOklch = rgbToOklch(reference)
  let best: { color: Rgb; distance: number } | null = null

  for (const candidate of palette) {
    if (contrastRatio(candidate, fixed) < required) continue
    const c = rgbToOklch(candidate)
    const dh = Math.abs(((c.h - referenceOklch.h + 540) % 360) - 180) / 180
    const distance =
      Math.abs(c.l - referenceOklch.l) + Math.abs(c.c - referenceOklch.c) + dh * 0.5
    if (best === null || distance < best.distance) {
      best = { color: candidate, distance }
    }
  }

  return best?.color ?? null
}
