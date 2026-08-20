/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Speech text formatting for the empathy integration.
 *
 * This is a local copy of `formatEntryForSpeech` from
 * `@vantra-design/screenreader-empathy/core`. Once the empathy package
 * publishes >= 0.4.0 with the core export, replace this file with:
 *
 *   export { formatEntryForSpeech } from '@vantra-design/screenreader-empathy/core'
 */

import type { TraversalEntry } from './empathy-types.js'

const ROLE_LABELS: Record<string, string> = {
  button: 'button', link: 'link', checkbox: 'checkbox',
  radio: 'radio button', tab: 'tab', switch: 'switch',
  textbox: 'edit text', listbox: 'pop-up button', slider: 'slider',
  searchbox: 'search text field', spinbutton: 'stepper',
  navigation: 'navigation', main: 'main', banner: 'banner',
  contentinfo: 'content info', complementary: 'complementary',
  form: 'form', search: 'search', region: 'region',
}

const ROLE_AFTER = new Set([
  'button', 'link', 'checkbox', 'radio', 'tab', 'switch',
])

const FORM_CONTROLS = new Set([
  'textbox', 'listbox', 'slider', 'searchbox', 'spinbutton',
])

export function formatRole(role: string): string {
  return ROLE_LABELS[role] ?? role
}

export function formatEntryForSpeech(entry: TraversalEntry): string {
  const { role, accessibleName, level, isLandmark } = entry

  if (role === 'image') {
    const hasMissingAlt = entry.flags.some(f => f.code === 'missing-alt-text')
    if (hasMissingAlt) return 'Image.'
    if (!accessibleName) return ''
    return `${accessibleName}, image.`
  }

  if (isLandmark) {
    const rl = formatRole(role)
    return accessibleName ? `${accessibleName}, ${rl} landmark.` : `${rl} landmark.`
  }

  if (role === 'heading') {
    const h = level ? `Heading level ${level}` : 'Heading'
    return accessibleName ? `${h}, ${accessibleName}.` : `${h}.`
  }

  if (ROLE_AFTER.has(role)) {
    const rl = formatRole(role)
    return accessibleName ? `${accessibleName}, ${rl}.` : `${rl}.`
  }

  if (FORM_CONTROLS.has(role)) {
    const rl = formatRole(role)
    return accessibleName ? `${accessibleName}, ${rl}.` : `${rl}.`
  }

  if (role === 'separator') return 'Separator.'
  if (role === 'table') return accessibleName ? `${accessibleName}, table.` : 'Table.'
  if (role === 'list') return accessibleName ? `${accessibleName}, list.` : 'List.'
  if (role === 'listitem') return accessibleName || 'List item.'
  if (accessibleName) return accessibleName

  return ''
}
