/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { FixProposal } from '@vantra-a11y/protocol'

import { resolveSelector } from './selector.js'

interface AppliedChange {
  key: string
  element: Element
  /** Inline style properties we set, with their previous inline value and priority. */
  styles: Array<{ property: string; previous: string; previousPriority: string }>
  /** Attributes we set, with `null` meaning "was absent". */
  attributes: Array<{ name: string; previous: string | null }>
  /**
   * Whether the element carried a `style` attribute before we touched it. Without
   * this we would leave an empty `style=""` behind on revert, which changes the
   * page's markup — exactly what a preview must never do.
   */
  hadStyleAttribute: boolean
}

const changeKey = (proposalId: string, selector: string): string => `${proposalId}@@${selector}`

/**
 * Applies a fix proposal to the live DOM as a *preview*.
 *
 * Every change records the exact previous state, so reverting restores the page
 * byte-for-byte. Nothing is ever written to the user's source — the preview is a
 * way to see the effect before copying the snippet, and the terminology says so:
 * "Vorschau anwenden", never "reparieren".
 *
 * Markup-level proposals (replacing a `div` with a `button`) are deliberately
 * *not* applied: rewriting element types could break the page's own event
 * handlers. Those are copy-only.
 */
export class PreviewApplier {
  private applied = new Map<string, AppliedChange>()

  apply(proposal: FixProposal, selector: string): boolean {
    const element = resolveSelector(selector)
    if (!element || !(element instanceof HTMLElement)) return false
    if (proposal.kind === 'markup') return false

    const key = changeKey(proposal.id, selector)
    if (this.applied.has(key)) return true

    const change: AppliedChange = {
      key,
      element,
      styles: [],
      attributes: [],
      hadStyleAttribute: element.hasAttribute('style'),
    }

    for (const [property, value] of Object.entries(proposal.after)) {
      if (proposal.kind === 'css') {
        change.styles.push({
          property,
          previous: element.style.getPropertyValue(property),
          previousPriority: element.style.getPropertyPriority(property),
        })
        // `important` so the preview wins over the page's own specificity.
        element.style.setProperty(property, value, 'important')
        continue
      }

      if (value === '(entfernt)') {
        change.attributes.push({ name: property, previous: element.getAttribute(property) })
        element.removeAttribute(property)
        continue
      }

      change.attributes.push({ name: property, previous: element.getAttribute(property) })
      element.setAttribute(property, value)
    }

    this.applied.set(key, change)
    return true
  }

  revert(proposalId: string, selector: string): void {
    const key = changeKey(proposalId, selector)
    const change = this.applied.get(key)
    if (!change) return

    this.restore(change)
    this.applied.delete(key)
  }

  revertAll(): void {
    // Newest first, so overlapping changes unwind in the order they were made.
    for (const change of [...this.applied.values()].reverse()) {
      this.restore(change)
    }
    this.applied.clear()
  }

  appliedIds(): string[] {
    return [...this.applied.keys()].map((key) => key.split('@@')[0] as string)
  }

  private restore(change: AppliedChange): void {
    const element = change.element
    if (!(element instanceof HTMLElement)) return

    for (const { property, previous, previousPriority } of change.styles) {
      if (previous === '') {
        element.style.removeProperty(property)
      } else {
        // The original priority has to come back too, or a page that relied on
        // an inline `!important` would silently lose it.
        element.style.setProperty(property, previous, previousPriority)
      }
    }

    // Removing the last inline property leaves `style=""` behind. If the element
    // had no style attribute to begin with, drop it entirely.
    if (!change.hadStyleAttribute && element.getAttribute('style') === '') {
      element.removeAttribute('style')
    }

    for (const { name, previous } of change.attributes) {
      if (previous === null) {
        element.removeAttribute(name)
      } else {
        element.setAttribute(name, previous)
      }
    }
  }
}
