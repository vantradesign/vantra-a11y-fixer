/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { LocalizedText } from '@vantra-a11y/protocol'

import { text } from './text.js'

/**
 * Turns axe's reason for declining into guidance the user can act on.
 *
 * axe knows exactly why it could not judge a finding, but reports it only as a
 * message key. Dropping that key is what produces the useless "189 items, check
 * manually" pile: hundreds of occurrences usually share one cause, and naming
 * the cause turns the pile into a single thing to look at.
 *
 * Each text says what stands in the way *and* how to settle it by hand, because
 * a finding we cannot decide must still not be a dead end.
 */
const GUIDANCE: Readonly<Record<string, string>> = {
  // The background is painted by a ::before/::after, which axe never measures —
  // and neither can we from CSS alone, since a pseudo element's geometry is not
  // exposed to script.
  pseudoContent: 'undecidedPseudoContent',
  bgImage: 'undecidedBgImage',
  bgGradient: 'undecidedBgGradient',
  bgOverlap: 'undecidedBgOverlap',
  imgNode: 'undecidedImgNode',
  fgAlpha: 'undecidedFgAlpha',
  shortTextContent: 'undecidedShortTextContent',
  equalRatio: 'undecidedEqualRatio',
  complexTextShadows: 'undecidedComplexTextShadows',
}

/**
 * Guidance for an undecided finding, or `null` when axe gave no reason we know —
 * the caller then falls back to the rule's own guidance rather than inventing an
 * explanation.
 */
export function undecidedGuidance(reason: string | undefined): LocalizedText | null {
  if (reason === undefined) return null
  const key = GUIDANCE[reason]
  return key === undefined ? null : text(key)
}

/** Whether we have specific guidance, used to keep reasons in separate clusters. */
export function hasUndecidedGuidance(reason: string | undefined): boolean {
  return reason !== undefined && GUIDANCE[reason] !== undefined
}
