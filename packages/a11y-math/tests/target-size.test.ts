/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from 'vitest'

import type { TargetBox } from '../src/index.js'
import { requiredTargetSize, solveTargetSize } from '../src/index.js'

const box = (overrides: Partial<TargetBox> = {}): TargetBox => ({
  widthPx: 16,
  heightPx: 16,
  paddingPx: { top: 0, right: 0, bottom: 0, left: 0 },
  boxSizing: 'content-box',
  display: 'block',
  ...overrides,
})

describe('requiredTargetSize', () => {
  it('uses 24px for AA (SC 2.5.8) and 44px for AAA (SC 2.5.5)', () => {
    expect(requiredTargetSize('AA')).toBe(24)
    expect(requiredTargetSize('AAA')).toBe(44)
  })

  it('falls back to the AA minimum at level A, which has no target-size criterion', () => {
    expect(requiredTargetSize('A')).toBe(24)
  })
})

describe('solveTargetSize', () => {
  it('reports a passing box as already meeting the requirement', () => {
    expect(solveTargetSize(box({ widthPx: 40, heightPx: 40 }), 24).meetsAlready).toBe(true)
  })

  it('treats exactly the required size as passing, not failing', () => {
    // The criterion is "at least 24px", so a 24px box must not be nudged to 25.
    const solution = solveTargetSize(box({ widthPx: 24, heightPx: 24 }), 24)

    expect(solution.meetsAlready).toBe(true)
    expect(solution.paddingDeltaPx).toEqual({ inline: 0, block: 0 })
  })

  it('fails when only one dimension is short', () => {
    const solution = solveTargetSize(box({ widthPx: 80, heightPx: 18 }), 24)

    expect(solution.meetsAlready).toBe(false)
    expect(solution.minHeightPx).toBe(24)
    // The wider dimension must be preserved, not shrunk to the minimum.
    expect(solution.minWidthPx).toBe(80)
  })

  it('splits the deficit across both sides so the centre does not move', () => {
    const solution = solveTargetSize(box({ widthPx: 16, heightPx: 16 }), 24)

    expect(solution.paddingDeltaPx).toEqual({ inline: 4, block: 4 })
  })

  it('adds the delta on top of existing padding', () => {
    const solution = solveTargetSize(
      box({ widthPx: 16, heightPx: 16, paddingPx: { top: 2, right: 3, bottom: 2, left: 3 } }),
      24,
    )

    expect(solution.paddingAfterPx).toEqual({ top: 6, right: 7, bottom: 6, left: 7 })
  })

  it('rounds a fractional deficit up, never down', () => {
    // 15.5px short by 8.5 → 4.25 per side, which must round to 5 so the result
    // actually clears the threshold rather than landing just under it.
    const solution = solveTargetSize(box({ widthPx: 15.5, heightPx: 15.5 }), 24)

    expect(solution.paddingDeltaPx.inline).toBe(5)
    expect(solution.widthBeforePx + solution.paddingDeltaPx.inline * 2).toBeGreaterThanOrEqual(24)
  })

  it('flags inline elements, where min-width and min-height have no effect', () => {
    expect(solveTargetSize(box({ display: 'inline' }), 24).needsDisplayChange).toBe(true)
    expect(solveTargetSize(box({ display: 'inline-block' }), 24).needsDisplayChange).toBe(false)
    expect(solveTargetSize(box({ display: 'flex' }), 24).needsDisplayChange).toBe(false)
  })

  it('never proposes a negative padding delta for an oversized dimension', () => {
    const solution = solveTargetSize(box({ widthPx: 200, heightPx: 10 }), 24)

    expect(solution.paddingDeltaPx.inline).toBe(0)
    expect(solution.paddingDeltaPx.block).toBe(7)
  })

  it('scales to the AAA requirement', () => {
    const solution = solveTargetSize(box({ widthPx: 24, heightPx: 24 }), 44)

    expect(solution.minWidthPx).toBe(44)
    expect(solution.paddingDeltaPx).toEqual({ inline: 10, block: 10 })
  })
})
