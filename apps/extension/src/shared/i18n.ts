/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { Category, Confidence, LocalizedText, Severity } from '@vantra-a11y/protocol'

// Type-only import: it contributes the key union at compile time and nothing at
// runtime, so the catalog is not duplicated into the bundle. `chrome.i18n` reads
// the very same file from _locales at runtime.
import type deMessages from '../../public/_locales/de/messages.json'

/**
 * Every key the catalog defines. A mistyped key is a compile error, and a key
 * that only exists in one locale cannot be referenced at all — the German
 * catalog is the source of truth for the key set.
 */
export type MessageKey = keyof typeof deMessages

/**
 * Resolves a catalog key through `chrome.i18n`.
 *
 * Falls back to the key itself when the catalog has no entry. That is a loud,
 * obviously-wrong string rather than an empty UI, which is what
 * `chrome.i18n.getMessage` returns for an unknown key.
 */
export function t(key: MessageKey, args?: readonly string[]): string {
  const resolved = chrome.i18n.getMessage(key, args as string[] | undefined)
  return resolved === '' ? key : resolved
}

/**
 * Resolves a `LocalizedText` produced by the analysis layer.
 *
 * The key is a plain string there — the fix-engine is locale-agnostic by design
 * and cannot depend on this catalog — so it is validated at runtime here and
 * covered by a catalog-completeness test.
 */
export function tt(value: LocalizedText): string {
  return t(value.key as MessageKey, value.args)
}

/**
 * Splits a message around its `$1` placeholder so the caller can render that
 * part differently, e.g. as inline code.
 *
 * Needed because word order differs between locales: "Open $1 and click …" vs
 * "$1 öffnen und … anklicken". Interpolating markup into the catalog would be
 * both unsafe under our CSP and untranslatable.
 */
export function tParts(key: MessageKey): [before: string, after: string] {
  // Substitute a marker that cannot occur in translated prose, then split on it.
  const MARKER = '\u0000'
  const [before = '', after = ''] = t(key, [MARKER]).split(MARKER)
  return [before, after]
}

export const CATEGORY_KEY: Record<Category, MessageKey> = {
  contrast: 'categoryContrast',
  semantics: 'categorySemantics',
  structure: 'categoryStructure',
  interaction: 'categoryInteraction',
  manual: 'categoryManual',
}

export const SEVERITY_KEY: Record<Severity, MessageKey> = {
  critical: 'severityCritical',
  high: 'severityHigh',
  medium: 'severityMedium',
  advisory: 'severityAdvisory',
  manual: 'severityManual',
}

export const CONFIDENCE_KEY: Record<Confidence, MessageKey> = {
  high: 'confidenceHigh',
  medium: 'confidenceMedium',
  review: 'confidenceReview',
}

export const CONFIDENCE_HINT_KEY: Record<Confidence, MessageKey> = {
  high: 'confidenceHintHigh',
  medium: 'confidenceHintMedium',
  review: 'confidenceHintReview',
}

/**
 * Picks between a singular and a plural catalog entry.
 *
 * `chrome.i18n` has no plural support. Two explicit keys cover German and
 * English correctly; a locale with more plural forms would need its own rule
 * here rather than a silently wrong string.
 */
export const plural = (count: number, one: MessageKey, other: MessageKey): string =>
  count === 1 ? t(one) : t(other, [String(count)])
