/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { Category } from '@vantra-a11y/protocol'

/**
 * Glyph so category is never conveyed by colour alone (SC 1.4.1).
 *
 * The only display constant left in the panel: these are symbols, not words, so
 * they carry no language. Everything translatable lives in the message catalog
 * and is reached through `shared/i18n.ts`.
 */
export const CATEGORY_GLYPH: Record<Category, string> = {
  contrast: '◐',
  semantics: 'A',
  structure: '▤',
  interaction: '⌖',
  manual: '?',
}
