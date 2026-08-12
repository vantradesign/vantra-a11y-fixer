/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const CSS_IDENT = /^[a-z_-][a-z0-9_-]*$/i

/**
 * Framework-generated classes change on every build, so a selector built from
 * them would be useless in the developer's source. These are skipped.
 */
const VOLATILE_CLASS = /(^|-)(css|sc|jsx|svelte|v-|hash|module)[-_]?[a-z0-9]{4,}/i

const isUsableId = (id: string): boolean =>
  id.length > 0 && CSS_IDENT.test(id) && !/\d{4,}/.test(id)

function classPart(element: Element): string {
  const classes = Array.from(element.classList)
    .filter((name) => CSS_IDENT.test(name) && !VOLATILE_CLASS.test(name))
    .slice(0, 2)
  return classes.map((name) => `.${CSS.escape(name)}`).join('')
}

function nthOfTypeIfNeeded(element: Element, base: string): string {
  const parent = element.parentElement
  if (!parent) return base
  const siblings = Array.from(parent.children).filter(
    (sibling) => sibling.tagName === element.tagName,
  )
  if (siblings.length <= 1) return base
  return `${base}:nth-of-type(${siblings.indexOf(element) + 1})`
}

/**
 * Builds a readable, unique-enough CSS selector. Prefers stable IDs, then
 * meaningful classes, and only falls back to positional `nth-of-type` when
 * nothing else disambiguates — the goal is a selector a developer can search
 * for in their own codebase, not the shortest possible one.
 */
export function buildSelector(element: Element): string {
  const id = element.getAttribute('id') ?? ''
  if (isUsableId(id)) return `#${CSS.escape(id)}`

  const parts: string[] = []
  let current: Element | null = element

  while (current && current !== document.documentElement && parts.length < 5) {
    const tag = current.tagName.toLowerCase()
    const currentId = current.getAttribute('id') ?? ''

    if (isUsableId(currentId)) {
      parts.unshift(`#${CSS.escape(currentId)}`)
      break
    }

    const base = `${tag}${classPart(current)}`
    parts.unshift(nthOfTypeIfNeeded(current, base))
    current = current.parentElement
  }

  return parts.join(' > ')
}

/** Resolves a selector back to a single element, tolerating stale matches. */
export function resolveSelector(selector: string): Element | null {
  try {
    return document.querySelector(selector)
  } catch {
    return null
  }
}
