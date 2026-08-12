/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from 'vitest'

import type { Rgb } from '../src/index.js'
import { judgePixelContrast, MIN_PIXEL_SAMPLES } from '../src/index.js'

const grey = (value: number): Rgb => ({ r: value, g: value, b: value, a: 1 })
const many = (color: Rgb, count: number): Rgb[] => Array.from({ length: count }, () => color)

const WHITE: Rgb = { r: 255, g: 255, b: 255, a: 1 }
const BLACK: Rgb = { r: 0, g: 0, b: 0, a: 1 }

describe('judgePixelContrast', () => {
  it('declines rather than guess when the sample is too thin', () => {
    // Below the floor a sample describes anti-aliasing, not a surface.
    expect(judgePixelContrast(many(grey(128), MIN_PIXEL_SAMPLES - 1), WHITE)).toBeNull()
    expect(judgePixelContrast([], WHITE)).toBeNull()
  })

  it('judges a uniform surface exactly as a CSS computation would', () => {
    const verdict = judgePixelContrast(many(WHITE, 100), BLACK)

    expect(verdict?.worstRatio).toBeCloseTo(21, 5)
    expect(verdict?.bestRatio).toBeCloseTo(21, 5)
    expect(verdict?.darkestHex).toBe('#ffffff')
    expect(verdict?.lightestHex).toBe('#ffffff')
  })

  it('decides a gradient on its worst end, not its average', () => {
    // Text over a gradient has to hold everywhere it sits. An average would call
    // half-failing text acceptable.
    const gradient = [...many(WHITE, 50), ...many(grey(120), 50)]

    const verdict = judgePixelContrast(gradient, WHITE)

    expect(verdict?.worstRatio).toBeLessThan(verdict!.bestRatio)
    // White on white is the worst case here: no contrast at all.
    expect(verdict?.worstRatio).toBeCloseTo(1, 5)
    expect(verdict?.worstBackground).toEqual(WHITE)
  })

  it('is not decided by a handful of stray pixels', () => {
    // One dark pixel from a border crossing the box, or a frame of animation
    // caught between the captures, must not condemn an otherwise fine surface.
    const surface = [...many(WHITE, 500), ...many(BLACK, 3)]

    const verdict = judgePixelContrast(surface, grey(90))

    expect(verdict?.darkestHex).toBe('#ffffff')
  })

  it('keeps a real dark region even though strays are trimmed', () => {
    // The trim is proportional, so a genuine population survives it while
    // isolated pixels do not.
    const surface = [...many(WHITE, 500), ...many(BLACK, 100)]

    const verdict = judgePixelContrast(surface, grey(90))

    expect(verdict?.darkestHex).toBe('#000000')
  })

  it('reports how many pixels the verdict rests on', () => {
    const verdict = judgePixelContrast(many(WHITE, 42), BLACK)

    expect(verdict?.sampled).toBe(42)
  })

  it('names the surface a fix has to work against', () => {
    // Correcting the text against the worst surface fixes every other one too.
    const surface = [...many(grey(200), 100), ...many(grey(250), 100)]

    const verdict = judgePixelContrast(surface, WHITE)

    expect(verdict?.worstBackground).toEqual(grey(250))
  })
})
