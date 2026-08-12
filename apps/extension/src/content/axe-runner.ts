/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import axe from 'axe-core'
import type { NormalizedIssue } from '@vantra-a11y/fix-engine'
import type { Settings } from '@vantra-a11y/protocol'
import { axeTagsFor } from '@vantra-a11y/protocol'

import type { AxeRuleResult } from './normalize.js'
import { normalizeRuleResult } from './normalize.js'

export interface AxeScan {
  axeVersion: string
  elementCount: number
  issues: NormalizedIssue[]
}

const OVERLAY_TAG = 'vantra-a11y-overlay'

/**
 * Runs axe-core against the current document.
 *
 * axe-core is bundled, never fetched — the extension makes no network requests
 * (see docs/ARCHITECTURE.md §6). Our own overlay host is excluded so the tool
 * cannot report issues it introduced itself.
 */
export async function runAxe(settings: Settings): Promise<AxeScan> {
  const results = await axe.run(
    { exclude: [[OVERLAY_TAG]] },
    {
      runOnly: { type: 'tag', values: axeTagsFor(settings.targetLevel) },
      resultTypes: ['violations', 'incomplete'],
      // We re-resolve elements from our own selectors, so axe's element
      // references are dead weight and cost time on large pages.
      elementRef: false,
    },
  )

  const issues = [
    ...results.violations.flatMap((rule) =>
      normalizeRuleResult(rule as unknown as AxeRuleResult, { incomplete: false }),
    ),
    ...results.incomplete.flatMap((rule) =>
      normalizeRuleResult(rule as unknown as AxeRuleResult, { incomplete: true }),
    ),
  ]

  return {
    axeVersion: axe.version,
    elementCount: document.querySelectorAll('*').length,
    issues,
  }
}
