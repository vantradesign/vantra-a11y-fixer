/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { E2E_SETTINGS, openFixture } from './helpers.js'

const FIXTURE = '/tests/e2e/fixtures/pixel-contrast.html'

/**
 * Gives the page a real camera.
 *
 * Playwright takes the screenshots the extension would get from
 * `chrome.tabs.captureVisibleTab`, so the measurement is exercised against
 * genuinely rendered pixels. A stubbed image would only prove that the code
 * agrees with itself.
 */
async function withCapture(page: Page): Promise<void> {
  await page.exposeFunction('__vantraCapture', async () => {
    const png = await page.screenshot({ animations: 'disabled' })
    return `data:image/png;base64,${png.toString('base64')}`
  })
}

const scan = (page: Page, measure: boolean) =>
  page.evaluate(
    async (settings) => {
      const result = await window.__vantraHarness.scan(settings)
      return {
        pixelCleared: result.pixelCleared ?? 0,
        needsManualReview: result.needsManualReview,
        clusters: result.clusters.map((cluster) => ({
          ruleId: cluster.ruleId,
          category: cluster.category,
          selectors: cluster.occurrences.map((occurrence) => occurrence.selector),
          guidanceKey: cluster.manualGuidance?.key,
          proposals: cluster.proposals.map((proposal) => ({
            rationaleKey: proposal.rationale.key,
            after: proposal.after,
            metrics: proposal.metrics,
          })),
        })),
      }
    },
    { ...E2E_SETTINGS, measurePixelContrast: measure },
  )

test.beforeEach(async ({ page }) => {
  await withCapture(page)
  await openFixture(page, FIXTURE)
})

test('leaves the finding undecided when measurement is off', async ({ page }) => {
  // Establishes the baseline the feature exists to change: axe cannot see behind
  // a pseudo element, so both bands are handed back as manual work — including
  // the one that is perfectly fine.
  const result = await scan(page, false)

  const contrast = result.clusters.filter((cluster) => cluster.ruleId === 'color-contrast')
  expect(contrast.length).toBeGreaterThan(0)
  for (const cluster of contrast) {
    expect(cluster.category).toBe('manual')
    expect(cluster.guidanceKey).toBe('undecidedPseudoContent')
  }
  expect(result.pixelCleared).toBe(0)
})

test('clears text that the measurement shows to be sufficient', async ({ page }) => {
  const result = await scan(page, true)

  // White on near-black: nothing for the user to do, so it must not appear.
  const mentionsOk = result.clusters.some((cluster) =>
    cluster.selectors.some((selector) => selector.includes('ok')),
  )
  expect(mentionsOk).toBe(false)
  expect(result.pixelCleared).toBeGreaterThan(0)
})

test('turns text that fails into a real finding with a fix', async ({ page }) => {
  const result = await scan(page, true)

  const failing = result.clusters.find((cluster) =>
    cluster.selectors.some((selector) => selector.includes('bad')),
  )

  expect(failing, 'the failing band must survive as a finding').toBeDefined()
  // No longer manual: it was measured, so it is an ordinary contrast issue.
  expect(failing?.category).toBe('contrast')
  expect(failing?.proposals.length).toBeGreaterThan(0)
})

test('says the background was measured, and reaches the required ratio', async ({ page }) => {
  const result = await scan(page, true)

  const failing = result.clusters.find((cluster) =>
    cluster.selectors.some((selector) => selector.includes('bad')),
  )
  const proposal = failing?.proposals[0]

  // Provenance on the card: a measured number is only usable if its origin is
  // visible to the person deciding whether to trust it.
  expect(proposal?.rationaleKey).toMatch(/^fixContrastRationalePixel/)
  expect(proposal?.metrics?.contrastAfter).toBeGreaterThanOrEqual(
    proposal?.metrics?.requiredRatio ?? 4.5,
  )
})

test('never proposes repainting a background it only photographed', async ({ page }) => {
  // The surface comes from a pseudo element; setting `background-color` on the
  // text would change nothing visible.
  const result = await scan(page, true)

  for (const cluster of result.clusters) {
    for (const proposal of cluster.proposals) {
      expect(Object.keys(proposal.after)).not.toContain('background-color')
    }
  }
})

test('leaves the page where it found it', async ({ page }) => {
  // Measurement scrolls through the document band by band. The user's scroll
  // position is theirs.
  await page.evaluate(() => window.scrollTo(0, 0))
  await scan(page, true)

  expect(await page.evaluate(() => window.scrollY)).toBe(0)
})
