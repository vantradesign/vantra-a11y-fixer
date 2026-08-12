/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { expect, test } from '@playwright/test'

import type { ScanSummary } from './helpers.js'
import { clusterFor, openFixture, runScan } from './helpers.js'

/**
 * End-to-end coverage of the real pipeline: axe-core runs against a laid-out
 * page, the content script measures actual computed styles and geometry, and the
 * fix engine turns that into proposals. jsdom cannot substitute here — every
 * assertion below depends on the browser having resolved colours and boxes.
 */

let summary: ScanSummary

test.beforeEach(async ({ page }) => {
  await openFixture(page)
  summary = await runScan(page)
})

test.describe('contrast findings', () => {
  test('clusters the two elements with an identical failing colour pair', async () => {
    const contrast = clusterFor(summary, 'color-contrast')
    const shared = contrast.find((cluster) => cluster.selectors.length > 1)

    expect(shared, 'the two #8a8a8a elements must collapse into one finding').toBeDefined()
    expect(shared?.selectors).toHaveLength(2)
  })

  test('keeps a different failing colour in its own finding', async () => {
    const contrast = clusterFor(summary, 'color-contrast')

    // Two distinct colour pairs must never be merged: the fix differs.
    const distinctAfterValues = new Set(
      contrast.flatMap((cluster) => cluster.proposals.map((proposal) => JSON.stringify(proposal.after))),
    )
    expect(distinctAfterValues.size).toBeGreaterThan(1)
  })

  test('computes a proposal that actually reaches the AA threshold', async () => {
    const withMetrics = clusterFor(summary, 'color-contrast')
      .flatMap((cluster) => cluster.proposals)
      .filter((proposal) => proposal.metrics !== undefined)

    expect(withMetrics.length).toBeGreaterThan(0)

    for (const proposal of withMetrics) {
      const metrics = proposal.metrics as NonNullable<typeof proposal.metrics>
      expect(metrics.requiredRatio).toBe(4.5)
      expect(metrics.contrastBefore).toBeLessThan(4.5)
      expect(metrics.contrastAfter).toBeGreaterThanOrEqual(4.5)
    }
  })

  test('emits copyable CSS that names a selector present in the page', async ({ page }) => {
    const proposal = clusterFor(summary, 'color-contrast')
      .flatMap((cluster) => cluster.proposals)
      .find((candidate) => candidate.css !== undefined)

    expect(proposal?.css).toContain('color:')

    const selector = proposal?.css?.split('{')[0]?.trim() ?? ''
    // A snippet whose selector matches nothing is worse than no snippet.
    await expect(page.locator(selector).first()).toBeAttached()
  })

  test('routes the gradient background to manual review instead of guessing', async () => {
    const gradient = summary.clusters.find((cluster) =>
      cluster.selectors.some((selector) => selector.includes('contrast-gradient')),
    )

    if (gradient) {
      // axe cannot resolve a single background colour behind a gradient, so no
      // deterministic proposal may be offered.
      expect(gradient.proposals.filter((proposal) => proposal.confidence === 'high')).toHaveLength(0)
      expect(gradient.manualGuidance).toBeTruthy()
    } else {
      // Some axe versions report this as incomplete rather than a violation; in
      // either case it must be counted as needing a human.
      expect(summary.needsManualReview).toBeGreaterThan(0)
    }
  })
})

test.describe('accessible name findings', () => {
  test('derives a name for the icon button from its class', async () => {
    const names = clusterFor(summary, 'button-name')
    const derived = names.flatMap((cluster) => cluster.proposals).map((proposal) => proposal.label)

    // The proposed name goes into the fixture, which is `lang="de"`, so it is
    // the German vocabulary entry regardless of the browser's UI language.
    expect(derived.some((label) => label.args?.includes('Schließen'))).toBe(true)
  })

  test('gives the signal-free button manual guidance rather than a made-up name', async () => {
    const emptyButton = clusterFor(summary, 'button-name').find((cluster) =>
      cluster.selectors.some((selector) => selector.includes('empty-button')),
    )

    expect(emptyButton).toBeDefined()
    expect(emptyButton?.proposals).toHaveLength(0)
    expect(emptyButton?.manualGuidance).toBeTruthy()
  })

  test('marks every name proposal for review, since only the author knows the intent', async () => {
    const proposals = clusterFor(summary, 'button-name').flatMap((cluster) => cluster.proposals)

    for (const proposal of proposals) {
      expect(proposal.confidence).not.toBe('high')
    }
  })
})

test.describe('target size findings', () => {
  test('proposes a 24px minimum for the standalone 16px control', async () => {
    const [targetSize] = clusterFor(summary, 'target-size')

    expect(targetSize, 'the 16x16 button must be reported').toBeDefined()

    const minSize = targetSize?.proposals.find((proposal) => 'min-width' in proposal.after)
    expect(minSize?.after['min-width']).toBe('24px')
    expect(minSize?.after['min-height']).toBe('24px')
  })

  test('leaves the inline link inside running text alone', async () => {
    const inline = clusterFor(summary, 'target-size').find((cluster) =>
      cluster.selectors.some((selector) => selector.includes('inline-link')),
    )

    // WCAG 2.5.8 excepts inline targets in a sentence. If axe reports it at all,
    // we must not offer to resize it.
    expect(inline?.proposals ?? []).toHaveLength(0)
  })
})

test.describe('scan result as a whole', () => {
  test('reports the real axe version and element count, not placeholders', async () => {
    expect(summary.axeVersion).toMatch(/^\d+\.\d+\.\d+/)
    expect(summary.elementCount).toBeGreaterThan(10)
  })

  test('never leaves a finding without either a proposal or manual guidance', async () => {
    for (const cluster of summary.clusters) {
      const hasHelp = cluster.proposals.length > 0 || Boolean(cluster.manualGuidance)
      expect(hasHelp, `cluster ${cluster.ruleId} is a dead end`).toBe(true)
    }
  })

  test('sorts the most severe findings first', async () => {
    const order = ['critical', 'high', 'medium', 'advisory', 'manual']
    const positions = summary.clusters.map((cluster) => order.indexOf(cluster.severity))

    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })

  test('is deterministic across two runs of the same page', async ({ page }) => {
    const second = await runScan(page)
    expect(JSON.stringify(second)).toBe(JSON.stringify(summary))
  })

  test('honours the category filter', async ({ page }) => {
    const contrastOnly = await runScan(page, { enabledCategories: ['contrast'] })

    expect(contrastOnly.clusters.length).toBeGreaterThan(0)
    for (const cluster of contrastOnly.clusters) {
      expect(cluster.category).toBe('contrast')
    }
  })

  test('raises the contrast requirement at AAA', async ({ page }) => {
    const aaa = await runScan(page, { targetLevel: 'AAA' })
    const metrics = clusterFor(aaa, 'color-contrast')
      .flatMap((cluster) => cluster.proposals)
      .map((proposal) => proposal.metrics)
      .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined)

    expect(metrics.length).toBeGreaterThan(0)
    for (const entry of metrics) {
      expect(entry.requiredRatio).toBe(7)
    }
  })
})
