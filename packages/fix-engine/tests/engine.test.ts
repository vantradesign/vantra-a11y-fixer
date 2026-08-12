/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from 'vitest'

import { analyse } from '../src/index.js'
import type { NormalizedIssue } from '../src/index.js'
import { issue, settings } from './helpers.js'

const input = (issues: NormalizedIssue[], overrides = {}) => ({
  url: 'https://example.com/pricing',
  scannedAt: 1_700_000_000_000,
  axeVersion: '4.10.0',
  elementCount: 312,
  issues,
  settings: settings(),
  ...overrides,
})

const failingButton = (selector: string): NormalizedIssue =>
  issue({
    ruleId: 'color-contrast',
    category: 'contrast',
    selector,
    tagName: 'button',
    contrast: {
      foreground: '#8a8a8a',
      background: '#ffffff',
      fontSizePx: 16,
      bold: false,
      indeterminate: false,
    },
  })

describe('analyse', () => {
  it('clusters occurrences that share a rule and an identical proposed change', () => {
    const result = analyse(input([failingButton('.btn-a'), failingButton('.btn-b'), failingButton('.btn-c')]))

    // This is the design-system view: one systemic problem, not three cards.
    expect(result.clusters).toHaveLength(1)
    expect(result.clusters[0]?.occurrences).toHaveLength(3)
    expect(result.clusters[0]?.occurrences.map((o) => o.selector)).toEqual(['.btn-a', '.btn-b', '.btn-c'])
  })

  it('keeps issues separate when the proposed change differs', () => {
    const other = issue({
      ruleId: 'color-contrast',
      selector: '.link',
      contrast: {
        foreground: '#b0b0b0',
        background: '#ffffff',
        fontSizePx: 16,
        bold: false,
        indeterminate: false,
      },
    })
    const result = analyse(input([failingButton('.btn-a'), other]))

    expect(result.clusters).toHaveLength(2)
  })

  it('sorts by severity first, then by how many elements are affected', () => {
    const advisory = issue({
      ruleId: 'target-size',
      category: 'interaction',
      selector: '.tiny',
    })
    const result = analyse(input([advisory, failingButton('.btn-a')]))

    expect(result.clusters[0]?.ruleId).toBe('color-contrast')
    expect(result.clusters[0]?.severity).toBe('critical')
  })

  it('never leaves a proposal-free cluster without manual guidance', () => {
    // Honesty guardrail: the UI must never show a dead end.
    const result = analyse(
      input([issue({ ruleId: 'heading-order', category: 'structure', selector: 'h4' })]),
    )

    expect(result.clusters[0]?.proposals).toHaveLength(0)
    expect(result.clusters[0]?.manualGuidance).toBeTruthy()
  })

  it('routes axe "incomplete" findings to the manual bucket and counts them', () => {
    const result = analyse(
      input([
        issue({
          ruleId: 'color-contrast',
          selector: '.hero',
          incomplete: true,
          contrast: {
            foreground: '#ffffff',
            background: '#ffffff',
            fontSizePx: 16,
            bold: false,
            indeterminate: true,
          },
        }),
      ]),
    )

    expect(result.clusters[0]?.category).toBe('manual')
    expect(result.clusters[0]?.severity).toBe('manual')
    expect(result.clusters[0]?.proposals).toHaveLength(0)
    expect(result.needsManualReview).toBe(1)
  })

  it('filters an incomplete finding by its manual category, not by its rule', () => {
    // Regression: the filter used to run on the rule's own category, so filtering
    // to "Kontrast" surfaced a card the contrast tile did not count.
    const indeterminate = issue({
      ruleId: 'color-contrast',
      category: 'contrast',
      selector: '.hero',
      incomplete: true,
    })

    const asContrast = analyse(
      input([indeterminate], { settings: settings({ enabledCategories: ['contrast'] }) }),
    )
    const asManual = analyse(
      input([indeterminate], { settings: settings({ enabledCategories: ['manual'] }) }),
    )

    expect(asContrast.clusters).toHaveLength(0)
    expect(asManual.clusters).toHaveLength(1)
  })

  it('honours the category filter', () => {
    const result = analyse(
      input([failingButton('.btn-a')], {
        settings: settings({ enabledCategories: ['semantics'] }),
      }),
    )

    expect(result.clusters).toHaveLength(0)
  })

  it('keeps unmapped axe rules visible instead of dropping them', () => {
    const result = analyse(
      input([issue({ ruleId: 'some-future-axe-rule', category: 'manual', title: 'Etwas Neues' })]),
    )

    expect(result.clusters).toHaveLength(1)
    // axe's own wording is all we have for an unknown rule, so it rides through
    // the catalog as a literal rather than being replaced by invented text.
    expect(result.clusters[0]?.title).toEqual({ key: 'literal', args: ['Etwas Neues'] })
    expect(result.clusters[0]?.manualGuidance).toBeTruthy()
  })

  it('is deterministic: identical input yields identical output', () => {
    const issues = [failingButton('.btn-a'), failingButton('.btn-b')]
    expect(JSON.stringify(analyse(input(issues)))).toBe(JSON.stringify(analyse(input(issues))))
  })

  it('passes scan metadata through unchanged', () => {
    const result = analyse(input([]))

    expect(result.url).toBe('https://example.com/pricing')
    expect(result.axeVersion).toBe('4.10.0')
    expect(result.elementCount).toBe(312)
    expect(result.targetLevel).toBe('AA')
  })
})
