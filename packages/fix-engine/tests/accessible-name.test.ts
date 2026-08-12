/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from 'vitest'

import { accessibleNameFixProvider, nameCandidates } from '../src/index.js'
import { context, issue } from './helpers.js'

const button = (overrides: Parameters<typeof issue>[0] = {}) =>
  issue({ ruleId: 'button-name', category: 'semantics', tagName: 'button', ...overrides })

describe('nameCandidates', () => {
  it('ranks visible text highest', () => {
    const [first] = nameCandidates(button({ visibleText: '  Jetzt buchen  ' }))

    expect(first?.value).toBe('Jetzt buchen')
    expect(first?.confidence).toBe('high')
  })

  it('rejects generic link text instead of proposing it', () => {
    // "hier klicken" is technically a name but tells a screen-reader user
    // nothing, so it must not be offered as a fix.
    const candidates = nameCandidates(button({ visibleText: 'hier klicken' }))
    expect(candidates.map((candidate) => candidate.value)).not.toContain('hier klicken')
  })

  it('falls back to the title attribute with medium confidence', () => {
    const [first] = nameCandidates(button({ attributes: { title: 'Menü schließen' } }))

    expect(first?.value).toBe('Menü schließen')
    expect(first?.confidence).toBe('medium')
  })

  it('derives a name from an unambiguous icon class, marked for review', () => {
    const candidates = nameCandidates(
      button({ attributes: { class: 'btn icon-close' }, html: '<button class="btn icon-close"></button>' }),
    )
    const icon = candidates.find(
      (candidate) => candidate.rationale.key === 'fixAriaLabelRationaleIcon',
    )

    expect(icon).toBeDefined()
    expect(icon?.value).toBe('Close')
    expect(icon?.confidence).toBe('review')
    // The rationale names the token it matched, so the guess is inspectable.
    expect(icon?.rationale.args).toEqual(['close'])
  })

  it('writes the proposed name in the language of the audited page', () => {
    // The name goes into the user's page, not into our UI, so it follows the
    // page's `lang` rather than the browser locale.
    const iconButton = button({
      attributes: { class: 'btn icon-close' },
      html: '<button class="btn icon-close"></button>',
    })

    const german = nameCandidates(iconButton, 'de').find(
      (candidate) => candidate.rationale.key === 'fixAriaLabelRationaleIcon',
    )

    expect(german?.value).toBe('Schließen')
  })

  it('does not let a substring trigger a wrong icon name', () => {
    // `closest` must not be read as `close`.
    const candidates = nameCandidates(button({ attributes: { class: 'closest-match' } }))
    expect(
      candidates.map((candidate) => candidate.rationale.key),
    ).not.toContain('fixAriaLabelRationaleIcon')
  })

  it('returns nothing when there is no signal at all', () => {
    expect(nameCandidates(button())).toHaveLength(0)
  })
})

describe('accessibleNameFixProvider', () => {
  it('marks every proposal as editable, because only the author knows the intent', () => {
    const proposals = accessibleNameFixProvider.propose(
      button({ visibleText: 'Speichern' }),
      context(),
    )

    expect(proposals.length).toBeGreaterThan(0)
    expect(proposals.every((proposal) => proposal.editable)).toBe(true)
  })

  it('escapes quotes in the generated snippet', () => {
    const [proposal] = accessibleNameFixProvider.propose(
      button({ attributes: { title: 'Sagt "Hallo"' } }),
      context(),
    )

    expect(proposal?.snippet.html).toContain('&quot;Hallo&quot;')
  })

  it('deduplicates identical candidates from different sources', () => {
    const proposals = accessibleNameFixProvider.propose(
      button({ visibleText: 'Suchen', attributes: { title: 'Suchen' } }),
      context(),
    )

    expect(proposals).toHaveLength(1)
  })

  it('caps the number of proposals so the panel stays readable', () => {
    const proposals = accessibleNameFixProvider.propose(
      button({
        visibleText: 'Eins',
        attributes: { title: 'Zwei', class: 'icon-search', 'data-nested-img-alt': 'Drei' },
        nearbyText: ['Vier'],
      }),
      context(),
    )

    expect(proposals.length).toBeLessThanOrEqual(3)
  })

  it('proposes nothing for rules it does not own', () => {
    expect(accessibleNameFixProvider.supports(issue({ ruleId: 'color-contrast' }))).toBe(false)
  })
})
