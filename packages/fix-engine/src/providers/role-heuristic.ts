/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { FixProposal } from '@vantra-a11y/protocol'
import { DIFF_ABSENT, DIFF_REMOVED } from '@vantra-a11y/protocol'

import { text } from '../text.js'
import type { FixProvider } from '../types.js'

const ROLE_RULES = new Set([
  'aria-roles',
  'aria-allowed-role',
  'aria-allowed-attr',
  'aria-required-attr',
])

/** Roles that a native element already provides, so setting them is redundant. */
const IMPLICIT_ROLES: Readonly<Record<string, string>> = {
  button: 'button',
  a: 'link',
  nav: 'navigation',
  main: 'main',
  header: 'banner',
  footer: 'contentinfo',
  aside: 'complementary',
  ul: 'list',
  ol: 'list',
  li: 'listitem',
  table: 'table',
  form: 'form',
  select: 'combobox',
  textarea: 'textbox',
}

/** Attributes each role requires in order to be announced meaningfully. */
const REQUIRED_ATTRS: Readonly<Record<string, string[]>> = {
  checkbox: ['aria-checked'],
  radio: ['aria-checked'],
  switch: ['aria-checked'],
  combobox: ['aria-expanded'],
  slider: ['aria-valuenow'],
  spinbutton: ['aria-valuenow'],
  tab: ['aria-selected'],
  heading: ['aria-level'],
}

export const roleHeuristicFixProvider: FixProvider = {
  id: 'role-heuristic',

  supports(issue) {
    return ROLE_RULES.has(issue.ruleId)
  },

  propose(issue, ctx) {
    const proposals: FixProposal[] = []
    const role = (issue.attributes['role'] ?? '').trim().toLowerCase()

    if (role.length > 0 && IMPLICIT_ROLES[issue.tagName] === role) {
      proposals.push({
        id: ctx.nextId('role-redundant'),
        kind: 'attribute',
        confidence: 'high',
        label: text('fixRoleRedundantLabel', role),
        rationale: text('fixRoleRedundantRationale', issue.tagName),
        before: { role },
        after: { role: DIFF_REMOVED },
        snippet: { html: `<${issue.tagName} …>` },
      })
    }

    const missing = (REQUIRED_ATTRS[role] ?? []).filter(
      (attr) => issue.attributes[attr] === undefined,
    )
    for (const attr of missing) {
      const suggested = attr === 'aria-checked' || attr === 'aria-expanded' || attr === 'aria-selected' ? 'false' : '0'
      proposals.push({
        id: ctx.nextId('role-required-attr'),
        kind: 'attribute',
        confidence: 'review',
        label: text('fixRoleRequiredAttrLabel', attr, suggested),
        rationale: text('fixRoleRequiredAttrRationale', role, attr),
        before: { [attr]: DIFF_ABSENT },
        after: { [attr]: suggested },
        snippet: { html: `<${issue.tagName} role="${role}" ${attr}="${suggested}" …>` },
      })
    }

    if (
      (issue.tagName === 'div' || issue.tagName === 'span') &&
      (role === 'button' || issue.attributes['onclick'] !== undefined)
    ) {
      proposals.push({
        id: ctx.nextId('native-element'),
        kind: 'markup',
        confidence: 'review',
        label: text('fixNativeButtonLabel'),
        rationale: text('fixNativeButtonRationale'),
        before: { element: `<${issue.tagName}${role ? ` role="${role}"` : ''}>` },
        after: { element: '<button type="button">' },
        snippet: { html: `<button type="button">${issue.visibleText.trim()}</button>` },
      })
    }

    return proposals
  },
}
