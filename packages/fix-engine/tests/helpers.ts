/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { Settings } from '@vantra-a11y/protocol'
import { DEFAULT_SETTINGS } from '@vantra-a11y/protocol'

import type { FixContext, NormalizedIssue } from '../src/index.js'

export function issue(overrides: Partial<NormalizedIssue> = {}): NormalizedIssue {
  return {
    ruleId: 'color-contrast',
    category: 'contrast',
    selector: '.example',
    html: '<div class="example">Beispiel</div>',
    rect: { x: 0, y: 0, w: 100, h: 20 },
    tagName: 'div',
    attributes: {},
    visibleText: '',
    nearbyText: [],
    incomplete: false,
    ...overrides,
  }
}

export function settings(overrides: Partial<Settings> = {}): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...overrides,
    fixPreferences: { ...DEFAULT_SETTINGS.fixPreferences, ...overrides.fixPreferences },
    overlay: { ...DEFAULT_SETTINGS.overlay, ...overrides.overlay },
  }
}

export function context(overrides: Partial<FixContext> = {}): FixContext {
  let counter = 0
  return {
    targetLevel: 'AA',
    settings: settings(),
    nextId: (prefix) => `${prefix}-${(counter += 1)}`,
    ...overrides,
  }
}
