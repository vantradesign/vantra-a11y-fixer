/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { FixProposal } from '@vantra-a11y/protocol'
import { DIFF_ABSENT } from '@vantra-a11y/protocol'

import { text } from '../text.js'
import type { FixProvider } from '../types.js'

const LABEL_RULES = new Set(['label', 'form-field-multiple-labels', 'select-name'])

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)

/**
 * Form fields without a label. Prefers a real `<label for>` over `aria-label`,
 * because the visible label also enlarges the click target — an accessibility win
 * that `aria-label` alone does not provide.
 */
export const labelAssociationFixProvider: FixProvider = {
  id: 'label-association',

  supports(issue) {
    return LABEL_RULES.has(issue.ruleId)
  },

  propose(issue, ctx) {
    const proposals: FixProposal[] = []
    const nearby = issue.nearbyText
      .map((entry) => entry.replace(/\s+/g, ' ').trim())
      .find((entry) => entry.length > 0 && entry.length <= 60)
    const placeholder = (issue.attributes['placeholder'] ?? '').trim()
    const existingId = (issue.attributes['id'] ?? '').trim()

    const labelText = nearby ?? placeholder
    if (labelText.length > 0) {
      const id = existingId.length > 0 ? existingId : `field-${slugify(labelText) || 'input'}`
      proposals.push({
        id: ctx.nextId('label-for'),
        kind: 'markup',
        confidence: nearby ? 'medium' : 'review',
        label: text('fixLabelForLabel', id),
        rationale: nearby
          ? text('fixLabelForRationaleNearby')
          : text('fixLabelForRationalePlaceholder'),
        before: existingId.length > 0 ? { id: existingId } : { label: DIFF_ABSENT },
        after: { label: labelText, id },
        snippet: {
          html: `<label for="${id}">${labelText}</label>\n<${issue.tagName} id="${id}" …>`,
        },
        editable: true,
      })
    }

    if (placeholder.length > 0) {
      proposals.push({
        id: ctx.nextId('aria-label-field'),
        kind: 'attribute',
        confidence: 'review',
        label: text('fixAriaLabelLabel', placeholder),
        rationale: text('fixFieldAriaLabelRationale'),
        before: { 'aria-label': DIFF_ABSENT },
        after: { 'aria-label': placeholder },
        snippet: { html: `<${issue.tagName} aria-label="${placeholder.replace(/"/g, '&quot;')}" …>` },
        editable: true,
      })
    }

    return proposals
  },
}
