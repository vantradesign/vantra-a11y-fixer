/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { expect, test, type Page } from '@playwright/test'

import { E2E_SETTINGS, openFixture } from './helpers.js'

/**
 * Overlay and preview behaviour in a browser with real layout.
 *
 * The shadow root is `closed` by design, so these tests assert what is
 * observable from outside — geometry, isolation, and the absence of side effects
 * on the host page. Marker positions are read off the instance, which the harness
 * can reach because the fields are TypeScript-private only; no production API was
 * widened to make this testable.
 */

test.beforeEach(async ({ page }) => {
  await openFixture(page)
})

test('draws one marker per occurrence, aligned with its target element', async ({ page }) => {
  const measurements = await page.evaluate(async (settings) => {
    const harness = window.__vantraHarness
    const result = await harness.scan()
    const overlay = harness.createOverlay()
    overlay.render(result.clusters, settings)

    const markers = harness.overlayMarkers(overlay)
    const selector = result.clusters[0]?.occurrences[0]?.selector ?? ''
    const targetRect = document.querySelector(selector)?.getBoundingClientRect()

    return {
      markerCount: markers.length,
      occurrenceCount: result.clusters.reduce(
        (sum, cluster) => sum + cluster.occurrences.length,
        0,
      ),
      first: markers[0] ? { x: markers[0].rect.x, y: markers[0].rect.y } : null,
      target: targetRect ? { x: targetRect.x, y: targetRect.y } : null,
    }
  }, E2E_SETTINGS)

  expect(measurements.markerCount).toBe(measurements.occurrenceCount)
  expect(measurements.first).not.toBeNull()
  expect(measurements.target).not.toBeNull()

  // The marker sits on the element, offset only by its own outline width.
  const outlineTolerance = E2E_SETTINGS.overlay.outlineWidthPx + 1
  expect(Math.abs((measurements.first?.x ?? 0) - (measurements.target?.x ?? 0))).toBeLessThanOrEqual(
    outlineTolerance,
  )
  expect(Math.abs((measurements.first?.y ?? 0) - (measurements.target?.y ?? 0))).toBeLessThanOrEqual(
    outlineTolerance,
  )
})

test('does not change the host page layout', async ({ page }) => {
  const layout = await page.evaluate(async (settings) => {
    const before = {
      height: document.documentElement.scrollHeight,
      width: document.documentElement.scrollWidth,
    }

    const harness = window.__vantraHarness
    const result = await harness.scan()
    harness.createOverlay().render(result.clusters, settings)

    return {
      before,
      after: {
        height: document.documentElement.scrollHeight,
        width: document.documentElement.scrollWidth,
      },
    }
  }, E2E_SETTINGS)

  // An overlay that added scroll height would change what the next scan measures.
  expect(layout.after).toEqual(layout.before)
})

test('keeps its internals out of reach of page CSS and page selectors', async ({ page }) => {
  const isolation = await page.evaluate(async (settings) => {
    const harness = window.__vantraHarness
    const result = await harness.scan()
    harness.createOverlay().render(result.clusters, settings)

    const host = document.querySelector('vantra-a11y-overlay')

    return {
      hostExists: host !== null,
      // A closed shadow root must not expose its tree, not even to the page.
      shadowReachable: (host as { shadowRoot?: unknown } | null)?.shadowRoot != null,
      // The page's own queries must not see overlay internals.
      markersVisibleToPage: document.querySelectorAll('.marker').length,
    }
  }, E2E_SETTINGS)

  expect(isolation.hostExists).toBe(true)
  expect(isolation.shadowReachable).toBe(false)
  expect(isolation.markersVisibleToPage).toBe(0)
})

test('is excluded from its own scan, so it never reports itself', async ({ page }) => {
  const findings = await page.evaluate(async (settings) => {
    const harness = window.__vantraHarness

    // A fingerprint that notices growth *inside* a cluster. Cluster count alone
    // is too coarse: every undecidable contrast finding collapses into a single
    // cluster, so hundreds of extra occurrences would not move that number.
    const shape = (result: Awaited<ReturnType<typeof harness.scan>>) => ({
      clusters: result.clusters.length,
      occurrences: result.clusters.reduce(
        (total, cluster) => total + cluster.occurrences.length,
        0,
      ),
      needsManualReview: result.needsManualReview,
    })

    const first = await harness.scan()
    harness.createOverlay().render(first.clusters, settings)
    const second = await harness.scan()

    return {
      first: shape(first),
      second: shape(second),
      mentionsOverlay: second.clusters.some((cluster) =>
        cluster.occurrences.some((occurrence) =>
          occurrence.selector.includes('vantra-a11y-overlay'),
        ),
      ),
    }
  }, E2E_SETTINGS)

  // Marker badges are white text on coloured backgrounds. If the overlay were not
  // excluded from the scan, a second run would invent new contrast findings.
  expect(findings.mentionsOverlay).toBe(false)

  // The overlay's layer is fixed across the whole viewport. Left visible during a
  // run it sits in the element stack of everything beneath it, and axe answers
  // "cannot determine the background" for the entire page.
  expect(findings.second).toEqual(findings.first)
})

/**
 * Scrolls the fixture and reports, for every marker, where it sits relative to
 * the element it belongs to. Markers are index-aligned with the flattened
 * occurrence list, which is the order the overlay renders them in.
 */
const scrollAndMeasure = (page: Page) =>
  page.evaluate(async (settings) => {
    const harness = window.__vantraHarness
    const result = await harness.scan()
    const overlay = harness.createOverlay()
    overlay.render(result.clusters, settings)

    const selectors = result.clusters.flatMap((cluster) =>
      cluster.occurrences.map((occurrence) => occurrence.selector),
    )

    document.documentElement.style.height = '4000px'
    window.scrollTo(0, 300)

    // The overlay repositions on a rAF, so wait for the next two frames.
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))

    return {
      scrollY: window.scrollY,
      markers: harness.overlayMarkers(overlay).map((marker, index) => {
        const rect = document.querySelector(selectors[index] ?? '')?.getBoundingClientRect()

        return {
          selector: selectors[index] ?? '',
          hidden: marker.hidden,
          markerY: marker.rect.y,
          elementY: rect?.y ?? 0,
          elementBottom: rect?.bottom ?? 0,
        }
      }),
    }
  }, E2E_SETTINGS)

test('markers still in view follow their element after a scroll', async ({ page }) => {
  const { scrollY, markers } = await scrollAndMeasure(page)
  expect(scrollY).toBe(300)

  const visible = markers.filter((marker) => !marker.hidden)
  // Not every fixture element survives the scroll, but some must, or the
  // assertion below would be vacuous.
  expect(visible.length).toBeGreaterThan(0)

  for (const marker of visible) {
    // Markers are fixed-position, so they track the viewport rect of the
    // element, not its document offset.
    expect(
      Math.abs(marker.markerY - marker.elementY),
      `marker for ${marker.selector} drifted from its element`,
    ).toBeLessThanOrEqual(E2E_SETTINGS.overlay.outlineWidthPx + 1)
  }
})

test('markers scrolled out of view are culled rather than left behind', async ({ page }) => {
  const { markers } = await scrollAndMeasure(page)

  // The overlay keeps a 40px margin around the viewport, because a marker just
  // above the fold still has its badge (top: -18px) on screen. Only elements
  // past that margin are expected to be culled.
  const CULL_MARGIN_PX = 40
  const offscreen = markers.filter((marker) => marker.elementBottom < -CULL_MARGIN_PX)

  // The fixture is short; only assert culling if the scroll actually pushed
  // something clear of the margin.
  test.skip(offscreen.length === 0, 'no element scrolled out of view')

  for (const marker of offscreen) {
    expect(marker.hidden, `marker for ${marker.selector} was not culled`).toBe(true)
  }
})

test('removes every trace of itself on destroy', async ({ page }) => {
  const remaining = await page.evaluate(async (settings) => {
    const harness = window.__vantraHarness
    const result = await harness.scan()
    const overlay = harness.createOverlay()
    overlay.render(result.clusters, settings)
    overlay.destroy()

    return document.querySelectorAll('vantra-a11y-overlay').length
  }, E2E_SETTINGS)

  expect(remaining).toBe(0)
})

test('renders nothing when the overlay is switched off', async ({ page }) => {
  const markerCount = await page.evaluate(async (settings) => {
    const harness = window.__vantraHarness
    const result = await harness.scan()
    const overlay = harness.createOverlay()
    overlay.render(result.clusters, settings)

    return harness.overlayMarkers(overlay).length
  }, { ...E2E_SETTINGS, overlay: { ...E2E_SETTINGS.overlay, enabled: false } })

  expect(markerCount).toBe(0)
})

test('applies and fully reverts a preview on the real page', async ({ page }) => {
  const outcome = await page.evaluate(async () => {
    const harness = window.__vantraHarness
    const result = await harness.scan()

    const cluster = result.clusters.find((entry) =>
      entry.proposals.some((proposal) => proposal.kind === 'css'),
    )
    const proposal = cluster?.proposals.find((entry) => entry.kind === 'css')
    const selector = cluster?.occurrences[0]?.selector ?? ''
    const element = document.querySelector(selector)
    if (!proposal || !element) throw new Error('fixture produced no CSS proposal')

    const styleBefore = element.getAttribute('style')
    const colorBefore = getComputedStyle(element).color

    const applier = harness.createApplier()
    applier.apply(proposal, selector)
    const colorApplied = getComputedStyle(element).color

    applier.revertAll()

    return {
      styleBefore,
      styleAfter: element.getAttribute('style'),
      colorBefore,
      colorApplied,
      colorAfter: getComputedStyle(element).color,
      appliedCount: applier.appliedIds().length,
    }
  })

  expect(outcome.colorApplied).not.toBe(outcome.colorBefore)
  expect(outcome.colorAfter).toBe(outcome.colorBefore)
  // The markup must be identical afterwards, not merely visually similar.
  expect(outcome.styleAfter).toBe(outcome.styleBefore)
  expect(outcome.appliedCount).toBe(0)
})
