/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from 'vitest'

import { contrastFixProvider } from '../src/index.js'
import { context, issue, settings } from './helpers.js'

const contrastIssue = (overrides: Record<string, unknown> = {}) =>
  issue({
    ruleId: 'color-contrast',
    selector: '.btn',
    contrast: {
      foreground: '#8a8a8a',
      background: '#ffffff',
      fontSizePx: 16,
      bold: false,
      indeterminate: false,
      ...overrides,
    },
  })

describe('contrastFixProvider.supports', () => {
  it('handles the two axe contrast rules', () => {
    expect(contrastFixProvider.supports(contrastIssue())).toBe(true)
    expect(
      contrastFixProvider.supports(issue({ ruleId: 'color-contrast-enhanced', contrast: contrastIssue().contrast })),
    ).toBe(true)
  })

  it('declines when axe could not resolve the colours', () => {
    // Background images and gradients are the v2 vision-layer use case; a
    // proposal computed from a guessed colour would be confidently wrong.
    expect(contrastFixProvider.supports(contrastIssue({ indeterminate: true }))).toBe(false)
  })

  it('declines rules it does not own', () => {
    expect(contrastFixProvider.supports(issue({ ruleId: 'button-name' }))).toBe(false)
  })
})

describe('contrast measured from rendered pixels', () => {
  const measured = (extra: Record<string, unknown> = {}) =>
    contrastIssue({
      foreground: '#8a8a8a',
      background: '#ffffff',
      backgroundSource: 'pixel',
      ...extra,
    })

  it('says the background was measured rather than read from CSS', () => {
    // A number whose origin is hidden cannot be checked, and an unverifiable
    // proposal is worse than none.
    const [proposal] = contrastFixProvider.propose(measured(), context())

    expect(proposal?.rationale.key).toBe('fixContrastRationalePixel')
    expect(proposal?.rationale.args).toContain('#ffffff')
  })

  it('discloses the spread when the text sits on a varying surface', () => {
    const [proposal] = contrastFixProvider.propose(
      measured({ backgroundRange: { darkest: '#eeeeee', lightest: '#ffffff' } }),
      context(),
    )

    expect(proposal?.rationale.key).toBe('fixContrastRationalePixelRange')
    expect(proposal?.rationale.args).toEqual(
      expect.arrayContaining(['#eeeeee', '#ffffff']),
    )
  })

  it('never offers to repaint a background it only photographed', () => {
    // The surface is a gradient, image or pseudo element. Setting
    // `background-color` would change nothing the user can see, so proposing it
    // would be a fix that quietly does not work.
    const proposals = contrastFixProvider.propose(
      measured(),
      context({
        settings: settings({
          fixPreferences: { preferAdjusting: 'background', snapToPalette: false, palette: [] },
        }),
      }),
    )

    expect(proposals.length).toBeGreaterThan(0)
    for (const proposal of proposals) {
      expect(Object.keys(proposal.after)).not.toContain('background-color')
    }
  })

  it('still offers both directions when the colours came from CSS', () => {
    const proposals = contrastFixProvider.propose(
      contrastIssue({ foreground: '#8a8a8a', background: '#ffffff' }),
      context({
        settings: settings({
          fixPreferences: { preferAdjusting: 'background', snapToPalette: false, palette: [] },
        }),
      }),
    )

    expect(proposals.some((p) => 'background-color' in p.after)).toBe(true)
  })
})

describe('contrastFixProvider.propose', () => {
  it('proposes both directions, foreground first by default', () => {
    const proposals = contrastFixProvider.propose(contrastIssue(), context())

    expect(proposals).toHaveLength(2)
    expect(proposals[0]?.after).toHaveProperty('color')
    expect(proposals[1]?.after).toHaveProperty('background-color')
  })

  it('respects the background-first preference', () => {
    const ctx = context({
      settings: settings({ fixPreferences: { preferAdjusting: 'background', snapToPalette: false, palette: [] } }),
    })
    const proposals = contrastFixProvider.propose(contrastIssue(), ctx)

    expect(proposals[0]?.after).toHaveProperty('background-color')
  })

  it('marks deterministic proposals as high confidence and reaches the AA ratio', () => {
    const [proposal] = contrastFixProvider.propose(contrastIssue(), context())

    expect(proposal?.confidence).toBe('high')
    expect(proposal?.metrics?.requiredRatio).toBe(4.5)
    expect(proposal?.metrics?.contrastAfter).toBeGreaterThanOrEqual(4.5)
  })

  it('applies the large-text threshold instead of the body-text one', () => {
    const large = contrastIssue({ foreground: '#b0b0b0', fontSizePx: 32 })
    const [proposal] = contrastFixProvider.propose(large, context())

    expect(proposal?.metrics?.requiredRatio).toBe(3)
    // Stops at 3:1 rather than over-darkening to the body-text 4.5:1.
    expect(proposal?.metrics?.contrastAfter).toBeLessThan(4.5)
  })

  it('leaves large text alone when it already clears the lower threshold', () => {
    // #8a8a8a on white is ~3.05:1 — a violation as body text, acceptable as
    // large text. Proposing a change here would be a false positive.
    const large = contrastIssue({ fontSizePx: 32 })
    expect(contrastFixProvider.propose(large, context())).toHaveLength(0)
  })

  it('uses the AAA ratio for the enhanced rule regardless of the target level', () => {
    const enhanced = issue({ ruleId: 'color-contrast-enhanced', contrast: contrastIssue().contrast })
    const [proposal] = contrastFixProvider.propose(enhanced, context({ targetLevel: 'AA' }))

    expect(proposal?.metrics?.requiredRatio).toBe(7)
  })

  it('emits a copyable CSS snippet scoped to the reported selector', () => {
    const [proposal] = contrastFixProvider.propose(contrastIssue(), context())

    expect(proposal?.snippet.css).toContain('.btn {')
    expect(proposal?.snippet.css).toMatch(/color: #[0-9a-f]{6};/)
  })

  it('proposes nothing when the pair already passes', () => {
    const passing = contrastIssue({ foreground: '#000000', background: '#ffffff' })
    expect(contrastFixProvider.propose(passing, context())).toHaveLength(0)
  })

  it('proposes nothing for unparseable colours instead of guessing', () => {
    const unparseable = contrastIssue({ foreground: 'currentColor' })
    expect(contrastFixProvider.propose(unparseable, context())).toHaveLength(0)
  })

  it('flattens a semi-transparent foreground before computing', () => {
    // rgba(0,0,0,0.35) over white renders as ~#a6a6a6 and fails AA; the proposal
    // must be based on the rendered colour, not the declared one.
    const translucent = contrastIssue({ foreground: 'rgba(0, 0, 0, 0.35)' })
    const [proposal] = contrastFixProvider.propose(translucent, context())

    expect(proposal?.metrics?.contrastBefore).toBeLessThan(4.5)
    expect(proposal?.metrics?.contrastAfter).toBeGreaterThanOrEqual(4.5)
  })

  it('offers a palette-snapped proposal with reduced confidence when enabled', () => {
    const ctx = context({
      settings: settings({
        fixPreferences: {
          preferAdjusting: 'foreground',
          snapToPalette: true,
          palette: ['#021f94', '#001619'],
        },
      }),
    })
    const proposals = contrastFixProvider.propose(contrastIssue(), ctx)
    const snapped = proposals.find((proposal) => proposal.id.startsWith('contrast-token'))

    expect(snapped).toBeDefined()
    expect(snapped?.confidence).toBe('medium')
  })
})
