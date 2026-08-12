/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { Confidence, FixProposal, LocalizedText } from '@vantra-a11y/protocol'
import { DIFF_ABSENT } from '@vantra-a11y/protocol'

import { text } from '../text.js'
import type { FixProvider, NormalizedIssue } from '../types.js'

/**
 * Languages the icon vocabulary is available in. A proposed accessible name is
 * written into the *audited page*, not into our UI, so it follows the page's
 * language rather than the browser's.
 */
export type NameLang = 'de' | 'en'

export const resolveNameLang = (pageLang: string | undefined): NameLang =>
  (pageLang ?? '').trim().toLowerCase().startsWith('de') ? 'de' : 'en'

const NAME_RULES = new Set(['button-name', 'link-name', 'input-button-name', 'aria-command-name'])

/**
 * Common icon vocabulary. Only entries whose meaning is unambiguous are listed —
 * a wrong accessible name is worse than a missing one, because it silently
 * misleads instead of visibly failing.
 */
const ICON_VOCABULARY: Readonly<Record<string, Record<NameLang, string>>> = {
  close: { de: 'Schließen', en: 'Close' },
  times: { de: 'Schließen', en: 'Close' },
  xmark: { de: 'Schließen', en: 'Close' },
  search: { de: 'Suchen', en: 'Search' },
  magnifier: { de: 'Suchen', en: 'Search' },
  menu: { de: 'Menü öffnen', en: 'Open menu' },
  hamburger: { de: 'Menü öffnen', en: 'Open menu' },
  cart: { de: 'Warenkorb', en: 'Cart' },
  basket: { de: 'Warenkorb', en: 'Cart' },
  trash: { de: 'Löschen', en: 'Delete' },
  delete: { de: 'Löschen', en: 'Delete' },
  edit: { de: 'Bearbeiten', en: 'Edit' },
  pencil: { de: 'Bearbeiten', en: 'Edit' },
  download: { de: 'Herunterladen', en: 'Download' },
  upload: { de: 'Hochladen', en: 'Upload' },
  settings: { de: 'Einstellungen', en: 'Settings' },
  gear: { de: 'Einstellungen', en: 'Settings' },
  cog: { de: 'Einstellungen', en: 'Settings' },
  user: { de: 'Konto', en: 'Account' },
  account: { de: 'Konto', en: 'Account' },
  profile: { de: 'Konto', en: 'Account' },
  print: { de: 'Drucken', en: 'Print' },
  share: { de: 'Teilen', en: 'Share' },
  play: { de: 'Abspielen', en: 'Play' },
  pause: { de: 'Pause', en: 'Pause' },
  next: { de: 'Weiter', en: 'Next' },
  prev: { de: 'Zurück', en: 'Previous' },
  previous: { de: 'Zurück', en: 'Previous' },
  back: { de: 'Zurück', en: 'Back' },
  home: { de: 'Startseite', en: 'Home' },
  info: { de: 'Weitere Informationen', en: 'More information' },
  help: { de: 'Hilfe', en: 'Help' },
  filter: { de: 'Filtern', en: 'Filter' },
  copy: { de: 'Kopieren', en: 'Copy' },
}

const GENERIC_TEXT = new Set([
  'hier',
  'hier klicken',
  'klick',
  'klicken',
  'mehr',
  'weiterlesen',
  'link',
  'read more',
  'more',
  'click here',
  'here',
])

interface NameCandidate {
  value: string
  confidence: Confidence
  /** Catalog reference explaining where the name was taken from. */
  rationale: LocalizedText
}

const clean = (value: string): string => value.replace(/\s+/g, ' ').trim()

function fromIconClasses(issue: NormalizedIssue, lang: NameLang): NameCandidate | null {
  const haystack = [
    issue.attributes['class'] ?? '',
    issue.attributes['data-icon'] ?? '',
    issue.html,
  ]
    .join(' ')
    .toLowerCase()

  for (const [token, label] of Object.entries(ICON_VOCABULARY)) {
    // Word-boundary-ish match so `close` does not fire on `closest`.
    if (new RegExp(`(^|[^a-z])${token}([^a-z]|$)`).test(haystack)) {
      return {
        value: label[lang],
        confidence: 'review',
        rationale: text('fixAriaLabelRationaleIcon', token),
      }
    }
  }
  return null
}

/**
 * Collects accessible-name candidates in descending reliability. Exported so the
 * heuristic can be tested directly against fixtures.
 */
export function nameCandidates(issue: NormalizedIssue, lang: NameLang = 'en'): NameCandidate[] {
  const candidates: NameCandidate[] = []

  const visible = clean(issue.visibleText)
  if (visible.length > 0 && !GENERIC_TEXT.has(visible.toLowerCase())) {
    candidates.push({
      value: visible,
      confidence: 'high',
      rationale: text('fixAriaLabelRationaleVisibleText'),
    })
  }

  const title = clean(issue.attributes['title'] ?? '')
  if (title.length > 0) {
    candidates.push({
      value: title,
      confidence: 'medium',
      rationale: text('fixAriaLabelRationaleTitleAttr'),
    })
  }

  const nestedAlt = clean(issue.attributes['data-nested-img-alt'] ?? '')
  if (nestedAlt.length > 0) {
    candidates.push({
      value: nestedAlt,
      confidence: 'medium',
      rationale: text('fixAriaLabelRationaleNestedAlt'),
    })
  }

  const value = clean(issue.attributes['value'] ?? '')
  if (value.length > 0 && issue.tagName === 'input') {
    candidates.push({
      value,
      confidence: 'medium',
      rationale: text('fixAriaLabelRationaleValueAttr'),
    })
  }

  const icon = fromIconClasses(issue, lang)
  if (icon) candidates.push(icon)

  const nearby = issue.nearbyText.map(clean).find((entry) => entry.length > 0 && entry.length <= 60)
  if (nearby) {
    candidates.push({
      value: nearby,
      confidence: 'review',
      rationale: text('fixAriaLabelRationaleNearby'),
    })
  }

  return candidates
}

/**
 * Proposes an accessible name for controls that have none. Every proposal is
 * marked `editable`, because only the author knows what the control really does —
 * we offer a starting point, not an answer.
 */
export const accessibleNameFixProvider: FixProvider = {
  id: 'accessible-name',

  supports(issue) {
    return NAME_RULES.has(issue.ruleId)
  },

  propose(issue, ctx) {
    const candidates = nameCandidates(issue, resolveNameLang(ctx.pageLang))
    if (candidates.length === 0) return []

    const seen = new Set<string>()

    return candidates
      .filter((candidate) => {
        const key = candidate.value.toLowerCase()
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .slice(0, 3)
      .map((candidate): FixProposal => {
        const escaped = candidate.value.replace(/"/g, '&quot;')
        return {
          id: ctx.nextId('aria-label'),
          kind: 'attribute',
          confidence: candidate.confidence,
          label: text('fixAriaLabelLabel', candidate.value),
          rationale: candidate.rationale,
          before: { 'aria-label': DIFF_ABSENT },
          after: { 'aria-label': candidate.value },
          snippet: { html: `<${issue.tagName} aria-label="${escaped}" …>` },
          editable: true,
        }
      })
  },
}
