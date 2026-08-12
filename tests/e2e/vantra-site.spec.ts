/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { expect, test } from '@playwright/test'

import { E2E_SETTINGS, harnessBuilt } from './helpers.js'

/**
 * Smoke test against the real vantra-site dev server.
 *
 * The fixture page is hand-built and therefore friendly: predictable class names,
 * no framework, no build step. This spec exists to catch what a fixture cannot —
 * hashed CSS-in-JS class names, deeply nested component markup, custom
 * properties, and a page large enough that scan performance matters.
 *
 * Skipped when the dev server is not running, because requiring a second repo to
 * be up would make the whole suite unreliable. Set `VANTRA_SITE_URL` to point it
 * elsewhere.
 */

const SITE_URL = process.env['VANTRA_SITE_URL'] ?? 'http://localhost:3000'
const HARNESS_FILE_URL = '/apps/extension/dist-harness/harness.js'

let reachable = false

test.beforeAll(async ({ request }) => {
  try {
    const response = await request.get(SITE_URL, { timeout: 3000 })
    reachable = response.ok()
  } catch {
    reachable = false
  }
})

test.beforeEach(async ({ page }) => {
  test.skip(
    !reachable,
    `vantra-site not reachable at ${SITE_URL} — start it with \`pnpm dev\` in vantra-site to run this spec.`,
  )
  expect(harnessBuilt()).toBe(true)

  await page.goto(SITE_URL, { waitUntil: 'networkidle' })

  // The harness lives on our own static server, which is a different origin than
  // the dev server; `addScriptTag` with a full URL handles that.
  await page.addScriptTag({ url: `${test.info().project.use.baseURL}${HARNESS_FILE_URL}` })
  await page.waitForFunction(() => window.__vantraHarness !== undefined)
})

test('completes a scan on a real framework-rendered page', async ({ page }) => {
  const summary = await page.evaluate(async (settings) => {
    const started = performance.now()
    const result = await window.__vantraHarness.scan(settings)

    return {
      durationMs: performance.now() - started,
      elementCount: result.elementCount,
      clusterCount: result.clusters.length,
      needsManualReview: result.needsManualReview,
      axeVersion: result.axeVersion,
    }
  }, E2E_SETTINGS)

  expect(summary.axeVersion).toMatch(/^\d+\.\d+\.\d+/)
  expect(summary.elementCount).toBeGreaterThan(20)
  // The PRD budgets a scan at under 5s for a typical page.
  expect(summary.durationMs).toBeLessThan(5000)
})

test('settles undecidable contrast on a real page instead of deferring it', async ({ page }) => {
  // The motivating case: on this page axe declines almost every contrast check,
  // because the design paints its surfaces with pseudo elements and gradients.
  // Handing all of that back as "check by hand" is the failure this measurement
  // exists to prevent.
  await page.exposeFunction('__vantraCapture', async () => {
    const png = await page.screenshot({ animations: 'disabled' })
    return `data:image/png;base64,${png.toString('base64')}`
  })

  const summary = await page.evaluate(async (settings) => {
    // Counted per occurrence, not per cluster: clustering is a presentation
    // choice, and one cluster can stand for a hundred elements a person would
    // otherwise have to inspect individually.
    const deferred = (result: {
      clusters: Array<{ ruleId: string; category: string; occurrences: unknown[] }>
    }) =>
      result.clusters
        .filter(
          (cluster) => cluster.ruleId.startsWith('color-contrast') && cluster.category === 'manual',
        )
        .reduce((sum, cluster) => sum + cluster.occurrences.length, 0)

    const before = await window.__vantraHarness.scan({
      ...settings,
      measurePixelContrast: false,
    })
    const after = await window.__vantraHarness.scan({
      ...settings,
      measurePixelContrast: true,
    })

    return {
      deferredBefore: deferred(before),
      deferredAfter: deferred(after),
      cleared: after.pixelCleared ?? 0,
      decided: after.clusters
        .filter(
          (cluster) =>
            cluster.ruleId.startsWith('color-contrast') && cluster.category === 'contrast',
        )
        .reduce((sum, cluster) => sum + cluster.occurrences.length, 0),
    }
  }, E2E_SETTINGS)

  // Recorded in the report rather than asserted on: the exact figures move with
  // the site, but seeing them is how a regression in yield gets noticed.
  test.info().annotations.push({
    type: 'pixel-measurement',
    description: JSON.stringify(summary),
  })

  expect(summary.deferredBefore).toBeGreaterThan(0)
  // Every undecidable finding it settles is one the user no longer has to check
  // by eye.
  expect(summary.cleared + summary.decided).toBeGreaterThan(0)
  expect(summary.deferredAfter).toBeLessThan(summary.deferredBefore)
})

test('produces selectors that resolve back to elements on the live page', async ({ page }) => {
  const resolution = await page.evaluate(async (settings) => {
    const result = await window.__vantraHarness.scan(settings)
    const selectors = result.clusters.flatMap((cluster) =>
      cluster.occurrences.map((occurrence) => occurrence.selector),
    )

    const unresolved = selectors.filter((selector) => {
      try {
        return document.querySelector(selector) === null
      } catch {
        return true
      }
    })

    return { total: selectors.length, unresolved }
  }, E2E_SETTINGS)

  // A selector that does not resolve is useless in both the overlay and the
  // copied snippet — this is the failure mode a hand-written fixture hides.
  expect(resolution.unresolved, `unresolved selectors: ${resolution.unresolved.join(', ')}`).toEqual(
    [],
  )
})

test('does not put framework-generated class hashes into selectors', async ({ page }) => {
  const selectors = await page.evaluate(async (settings) => {
    const result = await window.__vantraHarness.scan(settings)
    return result.clusters.flatMap((cluster) =>
      cluster.occurrences.map((occurrence) => occurrence.selector),
    )
  }, E2E_SETTINGS)

  // Hashed classes change on every build, so a selector containing one cannot be
  // found in the developer's source.
  const hashed = selectors.filter((selector) =>
    /(^|[.\s])(css|sc|svelte|jsx)-[a-z0-9]{5,}/i.test(selector),
  )

  expect(hashed, `selectors with build hashes: ${hashed.join(', ')}`).toEqual([])
})

test('every finding on a real page still offers a proposal or manual guidance', async ({ page }) => {
  const deadEnds = await page.evaluate(async (settings) => {
    const result = await window.__vantraHarness.scan(settings)
    return result.clusters
      .filter((cluster) => cluster.proposals.length === 0 && !cluster.manualGuidance)
      .map((cluster) => cluster.ruleId)
  }, E2E_SETTINGS)

  expect(deadEnds, `rules without any guidance: ${deadEnds.join(', ')}`).toEqual([])
})

test('reverts a preview on the live page without leaving a trace', async ({ page }) => {
  const outcome = await page.evaluate(async (settings) => {
    const harness = window.__vantraHarness
    const result = await harness.scan(settings)

    const cluster = result.clusters.find((entry) =>
      entry.proposals.some((proposal) => proposal.kind === 'css'),
    )
    const proposal = cluster?.proposals.find((entry) => entry.kind === 'css')
    const selector = cluster?.occurrences[0]?.selector ?? ''
    const element = selector ? document.querySelector(selector) : null

    if (!proposal || !element) return { skipped: true as const }

    const styleBefore = element.getAttribute('style')
    const applier = harness.createApplier()
    applier.apply(proposal, selector)
    applier.revertAll()

    return {
      skipped: false as const,
      styleBefore,
      styleAfter: element.getAttribute('style'),
    }
  }, E2E_SETTINGS)

  if (outcome.skipped) {
    test.info().annotations.push({
      type: 'note',
      description: 'No CSS proposal on the live page — nothing to revert.',
    })
    return
  }

  expect(outcome.styleAfter).toBe(outcome.styleBefore)
})
