/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import type { FixProposal } from '@vantra-a11y/protocol'
import { DIFF_ABSENT } from '@vantra-a11y/protocol'

import { PreviewApplier } from '../src/content/applier.js'

const cssProposal = (overrides: Partial<FixProposal> = {}): FixProposal => ({
  id: 'contrast-foreground-1',
  kind: 'css',
  confidence: 'high',
  label: { key: 'fixContrastDarkenText' },
  rationale: { key: 'fixContrastRationale', args: ['12.0', '4.50:1'] },
  before: { color: '#8a8a8a' },
  after: { color: '#595959' },
  snippet: { css: '.btn { color: #595959; }' },
  ...overrides,
})

const attributeProposal = (overrides: Partial<FixProposal> = {}): FixProposal => ({
  id: 'aria-label-1',
  kind: 'attribute',
  confidence: 'medium',
  label: { key: 'fixAriaLabelLabel', args: ['Suchen'] },
  rationale: { key: 'fixAriaLabelRationaleVisibleText' },
  before: { 'aria-label': DIFF_ABSENT },
  after: { 'aria-label': 'Suchen' },
  snippet: { html: '<button aria-label="Suchen" …>' },
  ...overrides,
})

describe('PreviewApplier', () => {
  let applier: PreviewApplier

  beforeEach(() => {
    document.body.innerHTML = '<button class="btn">Kaufen</button>'
    applier = new PreviewApplier()
  })

  const button = (): HTMLElement => document.querySelector<HTMLElement>('.btn') as HTMLElement

  // The CSSOM normalises colours, so `#595959` reads back as `rgb(89, 89, 89)`.
  const APPLIED_COLOR = 'rgb(89, 89, 89)'

  it('applies a CSS proposal to the live element', () => {
    expect(applier.apply(cssProposal(), '.btn')).toBe(true)
    expect(button().style.getPropertyValue('color')).toBe(APPLIED_COLOR)
  })

  it('wins over the page\'s own specificity by using !important', () => {
    applier.apply(cssProposal(), '.btn')
    expect(button().style.getPropertyPriority('color')).toBe('important')
  })

  it('restores an absent inline style exactly, leaving no empty attribute behind', () => {
    applier.apply(cssProposal(), '.btn')
    applier.revert('contrast-foreground-1', '.btn')

    expect(button().style.getPropertyValue('color')).toBe('')
    // The critical property: the page must look untouched, not merely similar.
    expect(button().getAttribute('style')).toBeNull()
  })

  it('restores a pre-existing inline style to its original value', () => {
    button().style.setProperty('color', 'rgb(1, 2, 3)')

    applier.apply(cssProposal(), '.btn')
    expect(button().style.getPropertyValue('color')).toBe(APPLIED_COLOR)

    applier.revert('contrast-foreground-1', '.btn')
    expect(button().style.getPropertyValue('color')).toBe('rgb(1, 2, 3)')
  })

  it('restores an original !important, which the preview would otherwise swallow', () => {
    button().style.setProperty('color', 'rgb(1, 2, 3)', 'important')

    applier.apply(cssProposal(), '.btn')
    applier.revert('contrast-foreground-1', '.btn')

    expect(button().style.getPropertyValue('color')).toBe('rgb(1, 2, 3)')
    expect(button().style.getPropertyPriority('color')).toBe('important')
  })

  it('keeps an existing style attribute rather than deleting it wholesale', () => {
    button().setAttribute('style', 'margin: 4px')

    applier.apply(cssProposal(), '.btn')
    applier.revert('contrast-foreground-1', '.btn')

    expect(button().style.getPropertyValue('margin')).toBe('4px')
    expect(button().hasAttribute('style')).toBe(true)
  })

  it('removes an attribute it added, rather than blanking it', () => {
    applier.apply(attributeProposal(), '.btn')
    expect(button().getAttribute('aria-label')).toBe('Suchen')

    applier.revert('aria-label-1', '.btn')
    expect(button().hasAttribute('aria-label')).toBe(false)
  })

  it('restores an attribute that already had a value', () => {
    button().setAttribute('aria-label', 'Alt')

    applier.apply(attributeProposal(), '.btn')
    applier.revert('aria-label-1', '.btn')

    expect(button().getAttribute('aria-label')).toBe('Alt')
  })

  it('handles the removal proposal shape used by the role provider', () => {
    button().setAttribute('role', 'button')
    const removal = attributeProposal({
      id: 'role-redundant-1',
      before: { role: 'button' },
      after: { role: '(entfernt)' },
    })

    applier.apply(removal, '.btn')
    expect(button().hasAttribute('role')).toBe(false)

    applier.revert('role-redundant-1', '.btn')
    expect(button().getAttribute('role')).toBe('button')
  })

  it('refuses markup proposals, which could break the page\'s event handlers', () => {
    const markup = cssProposal({ id: 'native-element-1', kind: 'markup' })
    expect(applier.apply(markup, '.btn')).toBe(false)
    expect(applier.appliedIds()).toHaveLength(0)
  })

  it('returns false for a selector that no longer resolves', () => {
    expect(applier.apply(cssProposal(), '.gone')).toBe(false)
  })

  it('is idempotent: applying twice does not corrupt the saved original', () => {
    applier.apply(cssProposal(), '.btn')
    applier.apply(cssProposal(), '.btn')
    applier.revert('contrast-foreground-1', '.btn')

    expect(button().getAttribute('style')).toBeNull()
    expect(applier.appliedIds()).toHaveLength(0)
  })

  it('reverts everything and leaves the DOM as it started', () => {
    document.body.innerHTML = '<button class="btn">Kaufen</button><a class="link">Mehr</a>'
    const before = document.body.innerHTML

    applier.apply(cssProposal(), '.btn')
    applier.apply(attributeProposal({ id: 'aria-label-2' }), '.link')
    expect(document.body.innerHTML).not.toBe(before)

    applier.revertAll()

    expect(document.body.innerHTML).toBe(before)
    expect(applier.appliedIds()).toHaveLength(0)
  })

  it('tracks the same proposal applied to different elements separately', () => {
    document.body.innerHTML = '<button class="btn">A</button><button class="btn2">B</button>'

    applier.apply(cssProposal(), '.btn')
    applier.apply(cssProposal(), '.btn2')
    applier.revert('contrast-foreground-1', '.btn')

    expect(document.querySelector<HTMLElement>('.btn')?.getAttribute('style')).toBeNull()
    // Reverting one occurrence must not silently drop the other.
    expect(document.querySelector<HTMLElement>('.btn2')?.style.getPropertyValue('color')).toBe(
      APPLIED_COLOR,
    )
  })
})
