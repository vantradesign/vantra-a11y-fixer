/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { ScanResult, Settings } from '@vantra-a11y/protocol'

/**
 * The surface the Playwright harness exposes inside the page. Mirrors
 * `apps/extension/tests/harness/entry.ts`; kept as a separate declaration so the
 * specs typecheck without pulling the extension's build config into this project.
 */
export interface VantraHarness {
  scan: (overrides?: Partial<Settings>) => Promise<ScanResult>
  buildSelector: (element: Element) => string
  createOverlay: () => VantraOverlay
  createApplier: () => VantraApplier
  overlayMarkers: (overlay: VantraOverlay) => Array<{
    category: string
    rect: DOMRect
    hidden: boolean
  }>
}

export interface VantraOverlay {
  render: (clusters: ScanResult['clusters'], settings: Settings) => void
  highlight: (selector: string) => void
  clear: () => void
  destroy: () => void
}

export interface VantraApplier {
  apply: (proposal: ScanResult['clusters'][number]['proposals'][number], selector: string) => boolean
  revert: (proposalId: string, selector: string) => void
  revertAll: () => void
  appliedIds: () => string[]
}

declare global {
  interface Window {
    __vantraHarness: VantraHarness
  }

  /**
   * Only the sliver of the extension API the specs evaluate inside a
   * `chrome-extension://` page. Pulling in `@types/chrome` here would put the
   * whole API in scope for tests that run on ordinary web pages, where it does
   * not exist.
   */
  const chrome: {
    i18n: { getUILanguage: () => string }
  }
}
