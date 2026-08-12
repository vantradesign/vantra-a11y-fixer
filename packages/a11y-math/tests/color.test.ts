/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from 'vitest'

import {
  composite,
  contrastRatio,
  oklchToRgb,
  parseColor,
  rgbToOklch,
  toHex,
} from '../src/index.js'

const WHITE = { r: 255, g: 255, b: 255, a: 1 }
const BLACK = { r: 0, g: 0, b: 0, a: 1 }

describe('parseColor', () => {
  it('parses long hex', () => {
    expect(parseColor('#021f94')).toEqual({ r: 2, g: 31, b: 148, a: 1 })
  })

  it('parses short hex', () => {
    expect(parseColor('#0a9')).toEqual({ r: 0, g: 170, b: 153, a: 1 })
  })

  it('parses hex with alpha', () => {
    const parsed = parseColor('#02020280')
    expect(parsed?.a).toBeCloseTo(0.502, 2)
  })

  it('parses legacy and modern rgb function syntax', () => {
    expect(parseColor('rgb(10, 20, 30)')).toEqual({ r: 10, g: 20, b: 30, a: 1 })
    expect(parseColor('rgb(10 20 30)')).toEqual({ r: 10, g: 20, b: 30, a: 1 })
    expect(parseColor('rgba(10, 20, 30, 0.5)')).toEqual({ r: 10, g: 20, b: 30, a: 0.5 })
    expect(parseColor('rgb(10 20 30 / 50%)')).toEqual({ r: 10, g: 20, b: 30, a: 0.5 })
  })

  it('returns null rather than guessing at unresolvable values', () => {
    // A wrong parse here would produce a confidently wrong fix proposal, which
    // is worse than declining to propose one.
    expect(parseColor('currentColor')).toBeNull()
    expect(parseColor('transparent')).toBeNull()
    expect(parseColor('linear-gradient(#fff, #000)')).toBeNull()
    expect(parseColor('rebeccapurple')).toBeNull()
  })
})

describe('parseColor on OKLab notations', () => {
  // Not an exotic case: a colour declared in `oklch()` is reported by
  // `getComputedStyle` as `oklab()`, and Tailwind 4 declares its whole palette
  // that way. Without these, contrast on such a page can never be decided.

  it('parses oklch white and black to sRGB extremes', () => {
    expect(parseColor('oklch(1 0 0)')).toEqual({ r: 255, g: 255, b: 255, a: 1 })
    expect(parseColor('oklch(0 0 0)')).toEqual({ r: 0, g: 0, b: 0, a: 1 })
  })

  it('parses the oklab form a browser actually returns', () => {
    // Verbatim from `getComputedStyle` on a Tailwind 4 page, alpha included.
    const parsed = parseColor('oklab(0.947125 -0.0455081 -0.021752 / 0.8)')

    expect(parsed).not.toBeNull()
    expect(parsed?.a).toBeCloseTo(0.8, 5)
    // A very light, faintly cyan tint — all channels high, red the lowest.
    expect(parsed!.r).toBeGreaterThan(190)
    expect(parsed!.g).toBeGreaterThan(parsed!.r)
    expect(parsed!.b).toBeGreaterThan(parsed!.r)
  })

  it('accepts percentages for lightness and chroma', () => {
    const asNumbers = parseColor('oklch(0.7 0.1 200)')
    const asPercent = parseColor('oklch(70% 25% 200)')

    expect(asPercent).toEqual(asNumbers)
  })

  it('accepts every angle unit CSS allows for the hue', () => {
    const deg = parseColor('oklch(0.6 0.1 180)')

    expect(parseColor('oklch(0.6 0.1 180deg)')).toEqual(deg)
    expect(parseColor('oklch(0.6 0.1 0.5turn)')).toEqual(deg)
    expect(parseColor('oklch(0.6 0.1 200grad)')).toEqual(deg)
  })

  it('treats a missing component as zero rather than failing', () => {
    expect(parseColor('oklch(0.5 none none)')).toEqual(parseColor('oklch(0.5 0 0)'))
  })

  it('round-trips through rgbToOklch without drifting', () => {
    const original = { r: 33, g: 118, b: 174, a: 1 }
    const oklch = rgbToOklch(original)
    const reparsed = parseColor(`oklch(${oklch.l} ${oklch.c} ${oklch.h})`)

    expect(reparsed?.r).toBeCloseTo(original.r, 0)
    expect(reparsed?.g).toBeCloseTo(original.g, 0)
    expect(reparsed?.b).toBeCloseTo(original.b, 0)
  })

  it('still declines malformed OKLab values', () => {
    expect(parseColor('oklch(0.5 0.1)')).toBeNull()
    expect(parseColor('oklab(nope 0 0)')).toBeNull()
  })
})

describe('contrastRatio', () => {
  it('matches the WCAG reference extremes', () => {
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 5)
    expect(contrastRatio(WHITE, WHITE)).toBeCloseTo(1, 5)
  })

  it('is symmetric', () => {
    const a = { r: 100, g: 120, b: 140, a: 1 }
    expect(contrastRatio(a, WHITE)).toBeCloseTo(contrastRatio(WHITE, a), 10)
  })

  it('matches known reference pairs', () => {
    // #767676 on white is the canonical "exactly 4.5:1" boundary value.
    expect(contrastRatio({ r: 118, g: 118, b: 118, a: 1 }, WHITE)).toBeCloseTo(4.54, 1)
    // #595959 on white is the canonical "exactly 7:1" boundary value.
    expect(contrastRatio({ r: 89, g: 89, b: 89, a: 1 }, WHITE)).toBeCloseTo(7.0, 1)
  })

  it('confirms the Vantra palette constraint documented in docs/IA.md', () => {
    const vantraBlue = parseColor('#021f94')!
    const vantraOffWhite = parseColor('#f5f2f3')!
    const vantraCyan = parseColor('#50e8f4')!
    const vantraInk = parseColor('#001619')!

    expect(contrastRatio(vantraBlue, vantraOffWhite)).toBeGreaterThan(7)
    expect(contrastRatio(vantraCyan, vantraInk)).toBeGreaterThan(7)
    // Cyan as text on the light background fails AA — hence "accent only".
    expect(contrastRatio(vantraCyan, vantraOffWhite)).toBeLessThan(4.5)
  })
})

describe('composite', () => {
  it('flattens a half-transparent black over white to mid grey', () => {
    const result = composite({ r: 0, g: 0, b: 0, a: 0.5 }, WHITE)
    expect(result.r).toBeCloseTo(127.5, 1)
    expect(result.a).toBe(1)
  })

  it('leaves opaque colours untouched', () => {
    expect(composite({ r: 1, g: 2, b: 3, a: 1 }, WHITE)).toEqual({ r: 1, g: 2, b: 3, a: 1 })
  })
})

describe('oklch round trip', () => {
  it('preserves sRGB values within a rounding step', () => {
    for (const hex of ['#021f94', '#f5f2f3', '#50e8f4', '#001619', '#767676', '#ff0000']) {
      const rgb = parseColor(hex)!
      expect(toHex(oklchToRgb(rgbToOklch(rgb)))).toBe(hex)
    }
  })

  it('reports achromatic colours with zero chroma', () => {
    expect(rgbToOklch({ r: 128, g: 128, b: 128, a: 1 }).c).toBeLessThan(1e-6)
  })
})
