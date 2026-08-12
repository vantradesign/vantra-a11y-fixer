/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { Category, WcagLevel } from './issue.js'

export type AxeTag = 'wcag2a' | 'wcag2aa' | 'wcag2aaa' | 'wcag21a' | 'wcag21aa' | 'wcag22aa'

export interface Settings {
  targetLevel: WcagLevel
  enabledCategories: Category[]
  overlay: {
    enabled: boolean
    outlineWidthPx: number
    /** Uses shape and pattern in addition to colour, for colour-blind users. */
    highContrastMarkers: boolean
  }
  /**
   * Settle undecidable contrast by measuring the rendered page.
   *
   * Costs a screenshot pair per viewport, so a long page adds seconds to a scan.
   * That is the trade: without it, text over gradients, images and pseudo
   * elements can only ever be handed back as "check by hand".
   */
  measurePixelContrast: boolean
  fixPreferences: {
    /** Which side to adjust first when solving a contrast issue. */
    preferAdjusting: 'foreground' | 'background'
    /** Snap proposals to an allowed palette instead of a free computed value. */
    snapToPalette: boolean
    /** Hex values of the allowed palette, used only when `snapToPalette` is on. */
    palette: string[]
  }
}

export const DEFAULT_SETTINGS: Settings = {
  targetLevel: 'AA',
  enabledCategories: ['contrast', 'semantics', 'structure', 'interaction', 'manual'],
  overlay: {
    enabled: true,
    outlineWidthPx: 2,
    highContrastMarkers: false,
  },
  measurePixelContrast: true,
  fixPreferences: {
    preferAdjusting: 'foreground',
    snapToPalette: false,
    palette: [],
  },
}

/** axe tags for a target level. AAA additionally implies the AA set. */
export function axeTagsFor(level: WcagLevel): AxeTag[] {
  switch (level) {
    case 'A':
      return ['wcag2a', 'wcag21a']
    case 'AA':
      return ['wcag2a', 'wcag21a', 'wcag2aa', 'wcag21aa', 'wcag22aa']
    case 'AAA':
      return ['wcag2a', 'wcag21a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'wcag2aaa']
  }
}
