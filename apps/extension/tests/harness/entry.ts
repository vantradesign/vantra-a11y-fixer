/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { analyse } from '@vantra-a11y/fix-engine'
import type { ScanResult, Settings } from '@vantra-a11y/protocol'
import { DEFAULT_SETTINGS } from '@vantra-a11y/protocol'

import deMessages from '../../public/_locales/de/messages.json'
import { PreviewApplier } from '../../src/content/applier.js'
import { runAxe } from '../../src/content/axe-runner.js'
import { measureContrast } from '../../src/content/measure-contrast.js'
import { Overlay } from '../../src/content/overlay.js'
import { buildSelector } from '../../src/content/selector.js'

/**
 * `chrome.i18n` for a plain page.
 *
 * The harness is injected as an ordinary script, not as a content script, so the
 * `chrome` namespace does not exist — but the overlay resolves catalog keys
 * through it. Stubbing it with the real German catalog keeps the harness on the
 * same code path as production instead of special-casing the overlay for tests.
 */
if (typeof chrome === 'undefined' || chrome.i18n === undefined) {
  const catalog = deMessages as Record<string, { message: string }>

  const getMessage = (key: string, substitutions?: string | string[]): string => {
    const message = catalog[key]?.message
    if (message === undefined) return ''

    const args = Array.isArray(substitutions) ? substitutions : [substitutions ?? '']
    return message.replace(/\$(\d)/g, (_match, index: string) => args[Number(index) - 1] ?? '')
  }

  Object.assign(globalThis, {
    chrome: { ...(globalThis as { chrome?: object }).chrome, i18n: { getMessage } },
  })
}

/**
 * Test-only bundle that exposes the DOM-facing content-script modules on
 * `window` so Playwright can drive them in a real browser with real layout.
 *
 * This deliberately does *not* include `src/content/index.ts`: that module owns
 * the `chrome.runtime` messaging, which needs a loaded extension. Everything the
 * harness exposes is the part where correctness depends on the browser actually
 * laying the page out — computed colours, geometry, target sizes — which is
 * exactly what jsdom cannot give us.
 */

interface Harness {
  scan: (overrides?: Partial<Settings>) => Promise<ScanResult>
  buildSelector: (element: Element) => string
  createOverlay: () => Overlay
  createApplier: () => PreviewApplier
  /**
   * Reads the marker list off an Overlay instance. The fields are TypeScript
   * `private`, which is compile-time only, so no production API had to be widened
   * to make the overlay observable — and the shadow root can stay closed.
   */
  overlayMarkers: (overlay: Overlay) => Array<{
    category: string
    rect: DOMRect
    /** True when the marker was culled for being outside the viewport. */
    hidden: boolean
  }>
}

const settingsWith = (overrides: Partial<Settings> = {}): Settings => ({
  ...DEFAULT_SETTINGS,
  ...overrides,
  overlay: { ...DEFAULT_SETTINGS.overlay, ...overrides.overlay },
  fixPreferences: { ...DEFAULT_SETTINGS.fixPreferences, ...overrides.fixPreferences },
})

const harness: Harness = {
  async scan(overrides) {
    const settings = settingsWith(overrides)
    const scanned = await runAxe(settings)

    // Mirrors the content script. The capture comes from Playwright rather than
    // from a panel, so the measurement runs against genuine screenshots instead
    // of a stand-in that could agree with a broken implementation.
    const measured = settings.measurePixelContrast
      ? await measureContrast(scanned.issues, settings, {
          capture: async () => (await window.__vantraCapture?.()) ?? null,
          captureIntervalMs: 0,
        })
      : { issues: scanned.issues, cleared: 0 }

    const result = analyse({
      url: location.href,
      scannedAt: Date.now(),
      axeVersion: scanned.axeVersion,
      elementCount: scanned.elementCount,
      issues: measured.issues,
      settings,
      // Mirrors the content script; without it the e2e specs would exercise a
      // different code path than production.
      pageLang: document.documentElement.lang,
    })

    return measured.cleared > 0 ? { ...result, pixelCleared: measured.cleared } : result
  },

  buildSelector,
  createOverlay: () => new Overlay(),
  createApplier: () => new PreviewApplier(),

  overlayMarkers(overlay) {
    const markers = (overlay as unknown as { markers: Array<{ category: string; box: HTMLElement }> })
      .markers
    return markers.map((marker) => ({
      category: marker.category,
      rect: marker.box.getBoundingClientRect(),
      hidden: marker.box.style.display === 'none',
    }))
  },
}

declare global {
  interface Window {
    __vantraHarness: Harness
    /** Installed by Playwright; returns a PNG data URL of the viewport. */
    __vantraCapture?: () => Promise<string>
  }
}

window.__vantraHarness = harness
