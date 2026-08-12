/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'

import { buildSelector, resolveSelector } from '../src/content/selector.js'

const render = (html: string): void => {
  document.body.innerHTML = html
}

const target = (): Element => document.querySelector('[data-target]') as Element

describe('buildSelector', () => {
  it('prefers a stable id, which is the shortest thing a developer can search for', () => {
    render('<div><button id="checkout" data-target>Kaufen</button></div>')
    expect(buildSelector(target())).toBe('#checkout')
  })

  it('ignores an id that looks generated', () => {
    // React/Vue often emit ids with long digit runs; they change every build, so
    // a selector built from them is useless in the source.
    render('<main><button id="btn-1739284612" data-target>Kaufen</button></main>')

    const selector = buildSelector(target())
    expect(selector).not.toContain('1739284612')
    expect(selector).toContain('button')
  })

  it('uses meaningful classes but skips framework hashes', () => {
    render('<div><button class="btn btn-primary css-1a2b3c4d" data-target>Kaufen</button></div>')

    const selector = buildSelector(target())
    expect(selector).toContain('.btn')
    expect(selector).not.toContain('css-1a2b3c4d')
  })

  it('caps the number of classes so the selector stays readable', () => {
    render('<div><button class="a b c d e f" data-target>X</button></div>')

    const selector = buildSelector(target())
    // Two classes are enough to identify; more just makes it unreadable.
    expect(selector.match(/\./g)?.length).toBeLessThanOrEqual(2)
  })

  it('adds nth-of-type only when siblings would otherwise be ambiguous', () => {
    render('<ul><li>Eins</li><li data-target>Zwei</li><li>Drei</li></ul>')
    expect(buildSelector(target())).toContain(':nth-of-type(2)')
  })

  it('omits nth-of-type for an only child of its type', () => {
    render('<div><span>Text</span><button data-target>Kaufen</button></div>')
    expect(buildSelector(target())).not.toContain('nth-of-type')
  })

  it('stops climbing at the nearest usable ancestor id', () => {
    render('<div id="cart"><div><button data-target>Kaufen</button></div></div>')

    const selector = buildSelector(target())
    expect(selector.startsWith('#cart')).toBe(true)
  })

  it('escapes characters that would otherwise break the selector', () => {
    render('<div><button class="w-1/2" data-target>Kaufen</button></div>')

    const selector = buildSelector(target())
    // Tailwind's slash would end the selector early if unescaped.
    expect(() => document.querySelector(selector)).not.toThrow()
  })

  it('keeps the path bounded on deeply nested markup', () => {
    render(
      '<div><div><div><div><div><div><div><button data-target>Tief</button></div></div></div></div></div></div></div>',
    )

    const selector = buildSelector(target())
    expect(selector.split('>').length).toBeLessThanOrEqual(5)
  })
})

describe('buildSelector + resolveSelector round trip', () => {
  const cases: Array<[string, string]> = [
    ['id', '<div><button id="ok" data-target>A</button></div>'],
    ['classes', '<div><button class="btn primary" data-target>A</button></div>'],
    ['sibling position', '<ul><li>1</li><li data-target>2</li><li>3</li></ul>'],
    ['no attributes at all', '<section><div><span data-target>A</span></div></section>'],
    ['tailwind slash class', '<div><a class="w-1/2 block" data-target>A</a></div>'],
    ['repeated identical siblings', '<div><p class="x">1</p><p class="x" data-target>2</p></div>'],
  ]

  for (const [name, html] of cases) {
    it(`resolves back to the same element: ${name}`, () => {
      render(html)
      const element = target()

      const resolved = resolveSelector(buildSelector(element))

      expect(resolved).toBe(element)
    })
  }
})

describe('resolveSelector', () => {
  it('returns null for a malformed selector instead of throwing', () => {
    // Selectors are generated once and re-resolved later; a stale or malformed
    // one must not take down the whole panel.
    expect(resolveSelector('div >>> nonsense[')).toBeNull()
  })

  it('returns null when the element is gone after a re-render', () => {
    render('<div><button id="temp">A</button></div>')
    const selector = buildSelector(document.querySelector('#temp') as Element)

    render('<div></div>')

    expect(resolveSelector(selector)).toBeNull()
  })
})
