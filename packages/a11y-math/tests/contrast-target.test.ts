/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from 'vitest'

import {
  contrastRatio,
  isLargeText,
  parseColor,
  requiredRatio,
  rgbToOklch,
  solveContrast,
  solveContrastFromPalette,
} from '../src/index.js'

const WHITE = parseColor('#ffffff')!
const OFF_WHITE = parseColor('#f5f2f3')!

describe('isLargeText', () => {
  it('follows the WCAG 18pt / 14pt-bold definition', () => {
    expect(isLargeText({ fontSizePx: 24, bold: false })).toBe(true)
    expect(isLargeText({ fontSizePx: 23.9, bold: false })).toBe(false)
    expect(isLargeText({ fontSizePx: 19, bold: true })).toBe(true)
    expect(isLargeText({ fontSizePx: 18, bold: true })).toBe(false)
  })
})

describe('requiredRatio', () => {
  const body = { fontSizePx: 16, bold: false }
  const heading = { fontSizePx: 32, bold: false }

  it('returns the SC 1.4.3 thresholds for AA', () => {
    expect(requiredRatio('AA', body)).toBe(4.5)
    expect(requiredRatio('AA', heading)).toBe(3)
  })

  it('returns the SC 1.4.6 thresholds for AAA', () => {
    expect(requiredRatio('AAA', body)).toBe(7)
    expect(requiredRatio('AAA', heading)).toBe(4.5)
  })

  it('imposes no ratio at level A', () => {
    expect(requiredRatio('A', body)).toBe(1)
  })
})

describe('solveContrast', () => {
  it('leaves a passing colour untouched', () => {
    const solution = solveContrast(parseColor('#021f94')!, OFF_WHITE, 4.5, 'foreground')
    expect(solution.lightnessDeltaPct).toBe(0)
    expect(solution.hex).toBe('#021f94')
    expect(solution.reachesTarget).toBe(true)
  })

  it('reaches the target ratio for grey text on white', () => {
    const start = parseColor('#8a8a8a')!
    const solution = solveContrast(start, WHITE, 4.5, 'foreground')

    expect(solution.ratioBefore).toBeLessThan(4.5)
    expect(solution.ratioAfter).toBeGreaterThanOrEqual(4.5)
    expect(solution.reachesTarget).toBe(true)
    // Text on a light background must get darker, never lighter.
    expect(solution.lightnessDeltaPct).toBeLessThan(0)
  })

  it('finds the minimal change, not an over-correction', () => {
    const start = parseColor('#8a8a8a')!
    const solution = solveContrast(start, WHITE, 4.5, 'foreground')
    // Within a hair of the requirement: no needless darkening of the brand colour.
    expect(solution.ratioAfter).toBeLessThan(4.6)
  })

  it('preserves hue and chroma so the colour still reads as the same brand tone', () => {
    const start = parseColor('#7ba7ff')!
    const solution = solveContrast(start, WHITE, 4.5, 'foreground')

    const before = rgbToOklch(start)
    const after = rgbToOklch(solution.rgb)
    expect(after.h).toBeCloseTo(before.h, 0)
    expect(after.c).toBeCloseTo(before.c, 1)
  })

  it('brightens when the fixed colour is dark', () => {
    const solution = solveContrast(parseColor('#333333')!, parseColor('#000000')!, 4.5, 'foreground')
    expect(solution.lightnessDeltaPct).toBeGreaterThan(0)
    expect(solution.ratioAfter).toBeGreaterThanOrEqual(4.5)
  })

  it('flags an unreachable target instead of returning a false pass', () => {
    // Nothing can reach 7:1 against mid grey, in either direction.
    const solution = solveContrast(parseColor('#808080')!, parseColor('#808080')!, 7, 'foreground')
    expect(solution.reachesTarget).toBe(false)
    expect(solution.ratioAfter).toBeLessThan(7)
  })

  it('solves the background direction as well', () => {
    const background = parseColor('#cccccc')!
    const text = parseColor('#999999')!
    const solution = solveContrast(background, text, 4.5, 'background')
    expect(contrastRatio(solution.rgb, text)).toBeGreaterThanOrEqual(4.5)
    expect(solution.target).toBe('background')
  })
})

describe('solveContrastFromPalette', () => {
  const palette = ['#021f94', '#f5f2f3', '#50e8f4', '#001619'].map((hex) => parseColor(hex)!)

  it('picks the nearest passing token', () => {
    const chosen = solveContrastFromPalette(palette, WHITE, 4.5, parseColor('#7ba7ff')!)
    expect(chosen).not.toBeNull()
    expect(contrastRatio(chosen!, WHITE)).toBeGreaterThanOrEqual(4.5)
  })

  it('returns null when no token qualifies, so the caller can downgrade confidence', () => {
    const cyanOnly = [parseColor('#50e8f4')!]
    expect(solveContrastFromPalette(cyanOnly, WHITE, 4.5, parseColor('#7ba7ff')!)).toBeNull()
  })
})
