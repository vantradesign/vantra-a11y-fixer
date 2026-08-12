/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from 'vitest'
import type { TargetBox } from '@vantra-a11y/math'

import { targetSizeFixProvider } from '../src/index.js'
import type { NormalizedIssue } from '../src/index.js'
import { context, issue } from './helpers.js'

const box = (overrides: Partial<TargetBox> = {}): TargetBox => ({
  widthPx: 16,
  heightPx: 16,
  paddingPx: { top: 0, right: 0, bottom: 0, left: 0 },
  boxSizing: 'content-box',
  display: 'inline-block',
  ...overrides,
})

const smallTarget = (overrides: Partial<NormalizedIssue> = {}): NormalizedIssue =>
  issue({
    ruleId: 'target-size',
    category: 'interaction',
    selector: '.icon-btn',
    tagName: 'button',
    box: box(),
    inlineInTextFlow: false,
    ...overrides,
  })

describe('targetSizeFixProvider.supports', () => {
  it('handles the target-size rule', () => {
    expect(targetSizeFixProvider.supports(smallTarget())).toBe(true)
  })

  it('declines rules it does not own', () => {
    expect(targetSizeFixProvider.supports(issue({ ruleId: 'color-contrast' }))).toBe(false)
  })

  it('declines when no box was measured', () => {
    expect(targetSizeFixProvider.supports(smallTarget({ box: undefined }))).toBe(false)
  })

  it('declines a zero-sized box, which means the element is not laid out', () => {
    expect(targetSizeFixProvider.supports(smallTarget({ box: box({ widthPx: 0, heightPx: 0 }) }))).toBe(
      false,
    )
  })

  it('declines inline elements inside running text, which WCAG 2.5.8 excepts', () => {
    // Enlarging a link inside a sentence would break the paragraph to satisfy a
    // criterion that was never violated in the first place.
    expect(targetSizeFixProvider.supports(smallTarget({ inlineInTextFlow: true }))).toBe(false)
  })
})

describe('targetSizeFixProvider.propose', () => {
  it('offers the min-size route first and the padding route second', () => {
    const proposals = targetSizeFixProvider.propose(smallTarget(), context())

    expect(proposals).toHaveLength(2)
    expect(proposals[0]?.after).toHaveProperty('min-width')
    expect(proposals[1]?.after).toHaveProperty('padding')
  })

  it('marks the min-size route as high confidence, the padding route lower', () => {
    const [minSize, padding] = targetSizeFixProvider.propose(smallTarget(), context())

    // Geometry is deterministic; whether padding grows the box depends on
    // box-sizing and an explicit width, which we cannot know.
    expect(minSize?.confidence).toBe('high')
    expect(padding?.confidence).toBe('medium')
  })

  it('reaches exactly the AA minimum without overshooting', () => {
    const [proposal] = targetSizeFixProvider.propose(smallTarget(), context())

    expect(proposal?.after['min-width']).toBe('24px')
    expect(proposal?.after['min-height']).toBe('24px')
  })

  it('uses the 44px AAA minimum when that is the target level', () => {
    const [proposal] = targetSizeFixProvider.propose(smallTarget(), context({ targetLevel: 'AAA' }))

    expect(proposal?.after['min-height']).toBe('44px')
  })

  it('preserves a dimension that already passes', () => {
    const wide = smallTarget({ box: box({ widthPx: 120, heightPx: 18 }) })
    const [proposal] = targetSizeFixProvider.propose(wide, context())

    expect(proposal?.after['min-width']).toBe('120px')
    expect(proposal?.after['min-height']).toBe('24px')
  })

  it('adds display: inline-block for inline elements, where min-* is ignored', () => {
    const inline = smallTarget({ box: box({ display: 'inline' }) })
    const [proposal] = targetSizeFixProvider.propose(inline, context())

    expect(proposal?.after['display']).toBe('inline-block')
    expect(proposal?.snippet.css).toContain('display: inline-block;')
  })

  it('does not mention display when the element is already a block-level box', () => {
    const [proposal] = targetSizeFixProvider.propose(smallTarget(), context())

    expect(proposal?.after).not.toHaveProperty('display')
  })

  it('warns about box-sizing in the padding proposal, because padding may not help there', () => {
    const borderBox = smallTarget({ box: box({ boxSizing: 'border-box' }) })
    const proposals = targetSizeFixProvider.propose(borderBox, context())

    expect(proposals[1]?.rationale.key).toBe('fixTargetPaddingRationaleBorderBox')
  })

  it('keeps existing padding and adds to it', () => {
    const padded = smallTarget({
      box: box({ paddingPx: { top: 2, right: 3, bottom: 2, left: 3 } }),
    })
    const proposals = targetSizeFixProvider.propose(padded, context())

    expect(proposals[1]?.after['padding']).toBe('6px 7px 6px 7px')
  })

  it('emits CSS scoped to the reported selector', () => {
    const [proposal] = targetSizeFixProvider.propose(smallTarget(), context())

    expect(proposal?.snippet.css).toContain('.icon-btn {')
  })

  it('proposes nothing when the target already meets the requirement', () => {
    const passing = smallTarget({ box: box({ widthPx: 48, heightPx: 48 }) })
    expect(targetSizeFixProvider.propose(passing, context())).toHaveLength(0)
  })

  it('omits the padding route when only a min-size change is meaningful', () => {
    // Both dimensions already pass at AA but the box was flagged anyway; the
    // guard above returns early, so this asserts the padding route is never
    // emitted with a zero delta.
    const proposals = targetSizeFixProvider.propose(
      smallTarget({ box: box({ widthPx: 24, heightPx: 24 }) }),
      context(),
    )

    expect(proposals).toHaveLength(0)
  })
})
