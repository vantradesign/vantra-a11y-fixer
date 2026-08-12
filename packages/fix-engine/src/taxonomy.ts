/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { Category, LocalizedText, Severity, WcagReference } from '@vantra-a11y/protocol'

export interface RuleDescriptor {
  category: Category
  severity: Severity
  wcag: WcagReference
  /** User-facing title. Never the axe wording, which assumes prior knowledge. */
  title: LocalizedText
  /** One or two sentences in plain language: what is wrong and who it affects. */
  explanation: LocalizedText
  /** Shown when no automated proposal can be generated. */
  manualGuidance?: LocalizedText
}

const text = (key: string, ...args: string[]): LocalizedText =>
  args.length > 0 ? { key, args } : { key }

/**
 * Maps axe rule IDs onto the Vantra taxonomy (docs/IA.md §2). Rules absent from
 * this table fall back to `describeRule`'s heuristic, so an axe upgrade that
 * adds rules degrades gracefully instead of dropping findings.
 */
export const RULE_TAXONOMY: Readonly<Record<string, RuleDescriptor>> = {
  'color-contrast': {
    category: 'contrast',
    severity: 'critical',
    wcag: { sc: '1.4.3', level: 'AA', title: text('wcag143') },
    title: text('ruleColorContrastTitle'),
    explanation: text('ruleColorContrastExplanation'),
  },
  'color-contrast-enhanced': {
    category: 'contrast',
    severity: 'high',
    wcag: { sc: '1.4.6', level: 'AAA', title: text('wcag146') },
    title: text('ruleColorContrastEnhancedTitle'),
    explanation: text('ruleColorContrastEnhancedExplanation'),
  },
  'button-name': {
    category: 'semantics',
    severity: 'critical',
    wcag: { sc: '4.1.2', level: 'A', title: text('wcag412') },
    title: text('ruleButtonNameTitle'),
    explanation: text('ruleButtonNameExplanation'),
  },
  'link-name': {
    category: 'semantics',
    severity: 'critical',
    wcag: { sc: '2.4.4', level: 'A', title: text('wcag244') },
    title: text('ruleLinkNameTitle'),
    explanation: text('ruleLinkNameExplanation'),
  },
  'image-alt': {
    category: 'semantics',
    severity: 'critical',
    wcag: { sc: '1.1.1', level: 'A', title: text('wcag111') },
    title: text('ruleImageAltTitle'),
    explanation: text('ruleImageAltExplanation'),
    manualGuidance: text('ruleImageAltGuidance'),
  },
  label: {
    category: 'semantics',
    severity: 'critical',
    wcag: { sc: '4.1.2', level: 'A', title: text('wcag412') },
    title: text('ruleLabelTitle'),
    explanation: text('ruleLabelExplanation'),
  },
  'aria-allowed-attr': {
    category: 'semantics',
    severity: 'high',
    wcag: { sc: '4.1.2', level: 'A', title: text('wcag412') },
    title: text('ruleAriaAllowedAttrTitle'),
    explanation: text('ruleAriaAllowedAttrExplanation'),
  },
  'aria-required-attr': {
    category: 'semantics',
    severity: 'high',
    wcag: { sc: '4.1.2', level: 'A', title: text('wcag412') },
    title: text('ruleAriaRequiredAttrTitle'),
    explanation: text('ruleAriaRequiredAttrExplanation'),
  },
  'aria-roles': {
    category: 'semantics',
    severity: 'high',
    wcag: { sc: '4.1.2', level: 'A', title: text('wcag412') },
    title: text('ruleAriaRolesTitle'),
    explanation: text('ruleAriaRolesExplanation'),
  },
  'heading-order': {
    category: 'structure',
    severity: 'medium',
    wcag: { sc: '1.3.1', level: 'A', title: text('wcag131') },
    title: text('ruleHeadingOrderTitle'),
    explanation: text('ruleHeadingOrderExplanation'),
    manualGuidance: text('ruleHeadingOrderGuidance'),
  },
  region: {
    category: 'structure',
    severity: 'medium',
    wcag: { sc: '1.3.1', level: 'A', title: text('wcag131') },
    title: text('ruleRegionTitle'),
    explanation: text('ruleRegionExplanation'),
    manualGuidance: text('ruleRegionGuidance'),
  },
  'landmark-one-main': {
    category: 'structure',
    severity: 'medium',
    wcag: { sc: '1.3.1', level: 'A', title: text('wcag131') },
    title: text('ruleLandmarkOneMainTitle'),
    explanation: text('ruleLandmarkOneMainExplanation'),
    manualGuidance: text('ruleLandmarkOneMainGuidance'),
  },
  'target-size': {
    category: 'interaction',
    severity: 'medium',
    wcag: { sc: '2.5.8', level: 'AA', title: text('wcag258') },
    title: text('ruleTargetSizeTitle'),
    explanation: text('ruleTargetSizeExplanation'),
    manualGuidance: text('ruleTargetSizeGuidance'),
  },
  tabindex: {
    category: 'interaction',
    severity: 'medium',
    wcag: { sc: '2.4.3', level: 'A', title: text('wcag243') },
    title: text('ruleTabindexTitle'),
    explanation: text('ruleTabindexExplanation'),
    manualGuidance: text('ruleTabindexGuidance'),
  },
}

const CATEGORY_BY_PREFIX: ReadonlyArray<[string, Category]> = [
  ['color-contrast', 'contrast'],
  ['aria-', 'semantics'],
  ['landmark-', 'structure'],
  ['heading-', 'structure'],
  ['focus-', 'interaction'],
  ['target-', 'interaction'],
]

/**
 * Fallback for axe rules not in the table above — keeps unknown findings
 * visible (categorised, honestly labelled as needing manual review) rather than
 * silently dropping them.
 */
export function describeRule(ruleId: string, axeHelp: string): RuleDescriptor {
  const known = RULE_TAXONOMY[ruleId]
  if (known) return known

  const prefixMatch = CATEGORY_BY_PREFIX.find(([prefix]) => ruleId.startsWith(prefix))

  return {
    category: prefixMatch?.[1] ?? 'manual',
    severity: 'advisory',
    wcag: { sc: '—', level: 'A', title: text('wcagUnknown') },
    // axe's own wording is the only description available here, so it is passed
    // through the catalog verbatim rather than invented.
    title: text('literal', axeHelp || ruleId),
    explanation: text('ruleFallbackExplanation'),
    manualGuidance: text('ruleFallbackGuidance'),
  }
}
