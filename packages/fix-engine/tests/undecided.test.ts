/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from 'vitest'

import { analyse, undecidedGuidance } from '../src/index.js'
import { issue, settings } from './helpers.js'

const undecided = (reason: string | undefined, selector: string) =>
  issue({ incomplete: true, incompleteReason: reason, selector })

const scan = (issues: ReturnType<typeof issue>[]) =>
  analyse({
    url: 'https://example.com',
    scannedAt: 0,
    axeVersion: '4.13.0',
    elementCount: 10,
    issues,
    settings: settings(),
  })

describe('undecidedGuidance', () => {
  it('names the obstacle for every reason axe reports', () => {
    // These are the keys axe-core emits from its colour-contrast check. A reason
    // we do not translate leaves the user with a bare "check manually".
    for (const reason of [
      'pseudoContent',
      'bgImage',
      'bgGradient',
      'bgOverlap',
      'imgNode',
      'fgAlpha',
      'shortTextContent',
      'equalRatio',
      'complexTextShadows',
    ]) {
      expect(undecidedGuidance(reason), reason).not.toBeNull()
    }
  })

  it('stays silent on reasons it does not know, rather than inventing one', () => {
    expect(undecidedGuidance('somethingNewInAxe5')).toBeNull()
    expect(undecidedGuidance(undefined)).toBeNull()
  })
})

describe('clustering of undecided findings', () => {
  it('keeps each reason apart, so one pile becomes separate decisions', () => {
    // The motivating case: a page reporting 189 undecided contrast findings. As
    // one cluster it is a wall; split by cause it is a handful of things to look
    // at, each with its own check.
    const result = scan([
      undecided('pseudoContent', '.a'),
      undecided('pseudoContent', '.b'),
      undecided('bgImage', '.c'),
      undecided('fgAlpha', '.d'),
    ])

    expect(result.clusters).toHaveLength(3)
    expect(result.clusters.map((cluster) => cluster.occurrences.length).sort()).toEqual([1, 1, 2])
  })

  it('gives each cluster the guidance for its own reason', () => {
    const result = scan([undecided('bgGradient', '.a'), undecided('imgNode', '.b')])

    const guidance = result.clusters.map((cluster) => cluster.manualGuidance?.key)
    expect(guidance).toContain('undecidedBgGradient')
    expect(guidance).toContain('undecidedImgNode')
  })

  it('still guides when axe gave no reason at all', () => {
    // No dead ends: an unknown cause must fall back to the rule's guidance.
    const result = scan([undecided(undefined, '.a')])

    expect(result.clusters[0]?.manualGuidance).toBeDefined()
  })

  it('leaves decided findings grouped by their proposal', () => {
    // The reason must not leak into the key for findings axe did decide, or
    // identical fixes would stop collapsing into one card.
    const decided = (selector: string) =>
      issue({
        selector,
        contrast: {
          foreground: '#777777',
          background: '#ffffff',
          fontSizePx: 16,
          bold: false,
          indeterminate: false,
        },
      })

    const result = scan([decided('.a'), decided('.b')])

    expect(result.clusters).toHaveLength(1)
    expect(result.clusters[0]?.occurrences).toHaveLength(2)
  })
})
