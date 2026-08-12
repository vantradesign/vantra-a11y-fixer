/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { NormalizedIssue } from '@vantra-a11y/fix-engine'
import { describeRule } from '@vantra-a11y/fix-engine'
import type { ElementRect } from '@vantra-a11y/protocol'
import type { TargetBox } from '@vantra-a11y/math'

import { buildSelector } from './selector.js'

/** Minimal shape we consume from axe, so the runner stays swappable. */
export interface AxeNodeResult {
  target: unknown[]
  html: string
  any?: AxeCheckResult[]
  all?: AxeCheckResult[]
  none?: AxeCheckResult[]
}

export interface AxeCheckResult {
  id: string
  data?: Record<string, unknown> | null
}

export interface AxeRuleResult {
  id: string
  help: string
  nodes: AxeNodeResult[]
}

const MAX_HTML = 240

const rectOf = (element: Element): ElementRect => {
  const box = element.getBoundingClientRect()
  return {
    x: box.left + window.scrollX,
    y: box.top + window.scrollY,
    w: box.width,
    h: box.height,
  }
}

function attributesOf(element: Element): Record<string, string> {
  const attributes: Record<string, string> = {}
  for (const attribute of Array.from(element.attributes)) {
    attributes[attribute.name] = attribute.value
  }

  // Surfaced as a pseudo-attribute so the fix engine can suggest an icon
  // button's name from a nested image without needing DOM access itself.
  const nestedImg = element.querySelector('img[alt]:not([alt=""])')
  const nestedAlt = nestedImg?.getAttribute('alt')
  if (nestedAlt) attributes['data-nested-img-alt'] = nestedAlt

  return attributes
}

/**
 * Collects text that could serve as a label: the preceding sibling, the parent's
 * own text and the following sibling — the three places authors actually put
 * visible labels.
 */
function nearbyTextOf(element: Element): string[] {
  const candidates: string[] = []
  const push = (node: Element | null | undefined): void => {
    const text = node?.textContent?.replace(/\s+/g, ' ').trim()
    if (text && text.length > 0 && text.length <= 60) candidates.push(text)
  }

  push(element.previousElementSibling)
  const parent = element.parentElement
  if (parent) {
    const ownText = Array.from(parent.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent ?? '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (ownText.length > 0 && ownText.length <= 60) candidates.push(ownText)
  }
  push(element.nextElementSibling)

  return candidates
}

const checksOf = (node: AxeNodeResult): AxeCheckResult[] => [
  ...(node.any ?? []),
  ...(node.all ?? []),
  ...(node.none ?? []),
]

/**
 * Why axe declined to judge this node.
 *
 * axe states the reason in one of two shapes depending on the check: a
 * `messageKey` on the data, or a `missingData` entry that is either a bare
 * string or a list of `{ reason }`. Both are read here so the guidance can name
 * the actual obstacle instead of shrugging.
 */
function incompleteReasonOf(node: AxeNodeResult): string | undefined {
  for (const check of checksOf(node)) {
    const data = check.data as Record<string, unknown> | undefined | null
    if (!data) continue

    if (typeof data['messageKey'] === 'string') return data['messageKey']

    const missing = data['missingData']
    if (typeof missing === 'string') return missing
    if (Array.isArray(missing)) {
      const first = missing[0] as { reason?: unknown } | undefined
      if (typeof first?.reason === 'string') return first.reason
    }
    if (typeof (missing as { reason?: unknown } | undefined)?.reason === 'string') {
      return (missing as { reason: string }).reason
    }
  }

  return undefined
}

/**
 * axe reports the resolved colour pair in the `color-contrast` check data. When
 * it cannot determine them — background images, gradients, overlapping layers —
 * the fields are missing, and we mark the issue indeterminate rather than
 * substituting a guess.
 */
function contrastOf(node: AxeNodeResult, element: Element): NormalizedIssue['contrast'] {
  const data = checksOf(node).find((check) => check.id.startsWith('color-contrast'))?.data as
    | Record<string, unknown>
    | undefined

  const style = window.getComputedStyle(element)
  const weight = Number.parseInt(style.fontWeight, 10)

  const foreground = typeof data?.['fgColor'] === 'string' ? (data['fgColor'] as string) : style.color
  const background =
    typeof data?.['bgColor'] === 'string' ? (data['bgColor'] as string) : style.backgroundColor

  return {
    foreground,
    background,
    fontSizePx: Number.parseFloat(style.fontSize) || 16,
    bold: Number.isFinite(weight) ? weight >= 700 : style.fontWeight === 'bold',
    indeterminate:
      typeof data?.['bgColor'] !== 'string' ||
      typeof data?.['fgColor'] !== 'string' ||
      data?.['contrastRatio'] === undefined,
  }
}

/**
 * Layout facts for the target-size rule. Read from the computed style rather than
 * the stylesheet, so shorthand, inherited and cascaded values are all resolved.
 */
function boxOf(element: Element): TargetBox {
  const style = window.getComputedStyle(element)
  const rect = element.getBoundingClientRect()
  const number = (value: string): number => Number.parseFloat(value) || 0

  return {
    widthPx: rect.width,
    heightPx: rect.height,
    paddingPx: {
      top: number(style.paddingTop),
      right: number(style.paddingRight),
      bottom: number(style.paddingBottom),
      left: number(style.paddingLeft),
    },
    boxSizing: style.boxSizing === 'border-box' ? 'border-box' : 'content-box',
    display: style.display,
  }
}

/**
 * Detects the shape WCAG 2.5.8 excepts: an inline element sitting in a run of
 * text, such as a link inside a paragraph. Enlarging those would break the
 * paragraph, so the fix engine must not propose it.
 */
function isInlineInTextFlow(element: Element): boolean {
  const display = window.getComputedStyle(element).display
  if (display !== 'inline') return false

  const parent = element.parentElement
  if (!parent) return false

  // Text alongside the element in the same block is what makes this "in a
  // sentence" rather than a standalone inline control.
  return Array.from(parent.childNodes).some(
    (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim().length > 0,
  )
}

const firstSelector = (target: unknown[]): string | null => {
  const first = target[0]
  if (typeof first === 'string') return first
  // Nested arrays denote iframe/shadow-DOM paths, which we do not follow in v0.1.
  return null
}

/**
 * Turns one axe rule result into per-element `NormalizedIssue` objects, doing all
 * DOM measuring here so everything downstream stays pure.
 */
export function normalizeRuleResult(
  rule: AxeRuleResult,
  options: { incomplete: boolean },
): NormalizedIssue[] {
  const descriptor = describeRule(rule.id, rule.help)
  const issues: NormalizedIssue[] = []

  for (const node of rule.nodes) {
    const selector = firstSelector(node.target)
    if (!selector) continue

    let element: Element | null
    try {
      element = document.querySelector(selector)
    } catch {
      element = null
    }
    if (!element) continue

    const isContrastRule = rule.id.startsWith('color-contrast')
    // Measuring padding and computed display costs a style resolve per element,
    // so it only happens for the rule that actually needs it.
    const isTargetSizeRule = rule.id === 'target-size'

    issues.push({
      ruleId: rule.id,
      category: descriptor.category,
      // axe's selector is optimised for machine re-resolution; ours is optimised
      // for a human searching their own codebase.
      selector: buildSelector(element),
      html: node.html.slice(0, MAX_HTML),
      rect: rectOf(element),
      title: rule.help,
      tagName: element.tagName.toLowerCase(),
      attributes: attributesOf(element),
      visibleText: (element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120),
      nearbyText: nearbyTextOf(element),
      contrast: isContrastRule ? contrastOf(node, element) : undefined,
      box: isTargetSizeRule ? boxOf(element) : undefined,
      inlineInTextFlow: isTargetSizeRule ? isInlineInTextFlow(element) : undefined,
      incomplete: options.incomplete,
      incompleteReason: options.incomplete ? incompleteReasonOf(node) : undefined,
    })
  }

  return issues
}
