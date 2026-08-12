/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { Settings } from '@vantra-a11y/protocol'
import { DEFAULT_SETTINGS } from '@vantra-a11y/protocol'

const KEY = 'settings'

/**
 * Settings live in `chrome.storage.local`, never `sync` — scan configuration is
 * local state and must not leave the machine (docs/ARCHITECTURE.md §6).
 */
export async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(KEY)
  const value = stored[KEY] as Partial<Settings> | undefined
  if (!value) return DEFAULT_SETTINGS

  // Merged field by field so a settings shape added in a later version does not
  // leave an old profile with missing keys.
  return {
    ...DEFAULT_SETTINGS,
    ...value,
    overlay: { ...DEFAULT_SETTINGS.overlay, ...value.overlay },
    fixPreferences: { ...DEFAULT_SETTINGS.fixPreferences, ...value.fixPreferences },
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [KEY]: settings })
}
