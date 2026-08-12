/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { FixProposal, IssueCluster, ScanResult, Settings, WcagLevel } from '@vantra-a11y/protocol'
import { compareSeverity } from '@vantra-a11y/protocol'

import { accessibleNameFixProvider } from './providers/accessible-name.js'
import { contrastFixProvider } from './providers/contrast.js'
import { labelAssociationFixProvider } from './providers/label-association.js'
import { roleHeuristicFixProvider } from './providers/role-heuristic.js'
import { targetSizeFixProvider } from './providers/target-size.js'
import { describeRule } from './taxonomy.js'
import { text } from './text.js'
import { undecidedGuidance } from './undecided.js'
import type { FixContext, FixProvider, NormalizedIssue } from './types.js'

/**
 * MVP provider set — all rule-based, no ML. v2 providers implement the same
 * interface and are appended here, which is what keeps the ML layer additive
 * rather than a rewrite.
 */
export const DEFAULT_PROVIDERS: readonly FixProvider[] = [
  contrastFixProvider,
  accessibleNameFixProvider,
  labelAssociationFixProvider,
  roleHeuristicFixProvider,
  targetSizeFixProvider,
]

export interface AnalyseInput {
  url: string
  scannedAt: number
  axeVersion: string
  elementCount: number
  issues: NormalizedIssue[]
  settings: Settings
  targetLevel?: WcagLevel
  /** `lang` of the audited document; steers proposed accessible names. */
  pageLang?: string
}

/**
 * Groups occurrences that share a rule *and* an identical proposed change, so a
 * design-system-wide problem shows up as "12 elements, 1 fix proposal" instead
 * of twelve near-identical cards. See docs/IA.md §2.
 */
function clusterKey(issue: NormalizedIssue, proposals: FixProposal[]): string {
  const fingerprint = proposals
    .map((proposal) => `${proposal.kind}:${JSON.stringify(proposal.after)}`)
    .join('|')
  // Undecided findings carry no proposal to group by, so without the reason they
  // would all land in one lump — "189 elements, check manually" — even though
  // each reason calls for a different check and usually a different CSS cause.
  const reason = issue.incomplete ? (issue.incompleteReason ?? '') : ''
  return `${issue.ruleId}::${fingerprint}::${reason}`
}

function createIdFactory(): (prefix: string) => string {
  const counters = new Map<string, number>()
  return (prefix) => {
    const next = (counters.get(prefix) ?? 0) + 1
    counters.set(prefix, next)
    return `${prefix}-${next}`
  }
}

/**
 * Turns normalized axe findings into the panel's view model. Pure function: same
 * input, same output, no DOM and no browser APIs — so it is unit testable and
 * reusable from the planned CI mode.
 */
export function analyse(input: AnalyseInput, providers = DEFAULT_PROVIDERS): ScanResult {
  const targetLevel = input.targetLevel ?? input.settings.targetLevel
  const ctx: FixContext = {
    targetLevel,
    settings: input.settings,
    pageLang: input.pageLang,
    nextId: createIdFactory(),
  }

  const byKey = new Map<string, IssueCluster>()
  let needsManualReview = 0

  for (const issue of input.issues) {
    const descriptor = describeRule(issue.ruleId, issue.title ?? '')

    // An "incomplete" finding belongs to the manual bucket regardless of which
    // rule produced it (docs/IA.md §2). The filter has to see that same category,
    // otherwise filtering to "Kontrast" would surface a card the contrast tile
    // does not count.
    const category = issue.incomplete ? 'manual' : descriptor.category
    const severity = issue.incomplete ? 'manual' : descriptor.severity

    if (!input.settings.enabledCategories.includes(category)) continue

    const proposals = issue.incomplete
      ? []
      : providers
          .filter((provider) => provider.supports(issue))
          .flatMap((provider) => provider.propose(issue, ctx))

    if (issue.incomplete || proposals.length === 0) needsManualReview += 1

    const key = clusterKey(issue, proposals)
    const existing = byKey.get(key)

    if (existing) {
      existing.occurrences.push({ selector: issue.selector, html: issue.html, rect: issue.rect })
      continue
    }

    byKey.set(key, {
      id: `cluster-${byKey.size + 1}`,
      ruleId: issue.ruleId,
      category,
      severity,
      wcag: descriptor.wcag,
      title: descriptor.title,
      explanation: descriptor.explanation,
      occurrences: [{ selector: issue.selector, html: issue.html, rect: issue.rect }],
      proposals,
      // Honesty guardrail: a cluster without proposals must always say what to
      // do manually, so the UI never shows a dead end.
      // Naming the obstacle beats repeating "check this by hand": axe already
      // knows why it declined, so the guidance says which layer is in the way.
      manualGuidance:
        proposals.length === 0
          ? (undecidedGuidance(issue.incompleteReason) ??
            descriptor.manualGuidance ??
            text('manualGuidanceGeneric'))
          : descriptor.manualGuidance,
    })
  }

  const clusters = [...byKey.values()].sort((a, b) => {
    const bySeverity = compareSeverity(a.severity, b.severity)
    if (bySeverity !== 0) return bySeverity
    return b.occurrences.length - a.occurrences.length
  })

  return {
    url: input.url,
    scannedAt: input.scannedAt,
    targetLevel,
    axeVersion: input.axeVersion,
    elementCount: input.elementCount,
    clusters,
    needsManualReview,
  }
}
