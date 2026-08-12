/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import de from '../public/_locales/de/messages.json' with { type: 'json' }
import en from '../public/_locales/en/messages.json' with { type: 'json' }

/**
 * Guards the seam between the locale-agnostic analysis layer and the catalog.
 *
 * `fix-engine` emits message keys as plain strings — it cannot depend on this
 * package, so TypeScript cannot check them. Without these tests a renamed key
 * would surface as the raw key in the UI, and only in the code path that
 * produces it.
 */

interface Entry {
  message: string
  description?: string
}

const SRC = resolve(import.meta.dirname, '../src')
const ENGINE_SRC = resolve(import.meta.dirname, '../../../packages/fix-engine/src')

const catalogs: Record<string, Record<string, Entry>> = { de, en }

/** Collects every `.ts`/`.vue` file below a directory. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(ts|vue)$/.test(entry.name) ? [path] : []
  })
}

/** Message keys referenced through the engine's `text('key', …)` helper. */
function engineKeys(): Set<string> {
  const keys = new Set<string>()
  for (const file of sourceFiles(ENGINE_SRC)) {
    const content = readFileSync(file, 'utf8')
    for (const [, key] of content.matchAll(/\btext\(\s*'([A-Za-z0-9_]+)'/g)) {
      if (key) keys.add(key)
    }
    // Keys chosen by a conditional, e.g. `text(cond ? 'a' : 'b', …)`.
    for (const [, a, b] of content.matchAll(
      /\btext\(\s*\n?\s*[^,)]*\?\s*'([A-Za-z0-9_]+)'\s*:\s*'([A-Za-z0-9_]+)'/g,
    )) {
      if (a) keys.add(a)
      if (b) keys.add(b)
    }
  }
  return keys
}

/** Message keys referenced from the extension through `t(...)` / `tParts(...)`. */
function panelKeys(): Set<string> {
  const keys = new Set<string>()
  for (const file of sourceFiles(SRC)) {
    const content = readFileSync(file, 'utf8')
    for (const [, key] of content.matchAll(/\bt(?:Parts)?\(\s*'([A-Za-z0-9_]+)'/g)) {
      if (key) keys.add(key)
    }
  }
  return keys
}

/**
 * Every quoted identifier in both trees that happens to be a catalog key.
 *
 * Deliberately loose, and only used to decide whether an entry is referenced at
 * all: keys also reach the catalog through `plural(n, 'a', 'b')`, through key
 * maps like `CATEGORY_KEY`, and through conditionals that pick between two
 * literals. Matching only call sites would report those entries as orphans.
 */
function referencedKeys(): Set<string> {
  const keys = new Set<string>()
  for (const file of [...sourceFiles(SRC), ...sourceFiles(ENGINE_SRC)]) {
    const content = readFileSync(file, 'utf8')
    for (const [, key] of content.matchAll(/'([A-Za-z0-9_]+)'/g)) {
      if (key && key in de) keys.add(key)
    }
  }
  return keys
}

describe('message catalogs', () => {
  it('define exactly the same key set in every locale', () => {
    const german = Object.keys(de).sort()
    const english = Object.keys(en).sort()

    expect(english).toEqual(german)
  })

  it('leave no entry empty', () => {
    for (const [locale, catalog] of Object.entries(catalogs)) {
      for (const [key, entry] of Object.entries(catalog)) {
        expect(entry.message.trim(), `${locale}.${key} is empty`).not.toBe('')
      }
    }
  })

  it('use the same placeholders in every locale', () => {
    const placeholders = (message: string): string[] =>
      [...new Set(message.match(/\$\d/g) ?? [])].sort()

    for (const [key, entry] of Object.entries(de)) {
      const other = en[key as keyof typeof en] as Entry | undefined
      expect(placeholders(other?.message ?? ''), `placeholders differ for "${key}"`).toEqual(
        placeholders(entry.message),
      )
    }
  })

  it('keep the literal pass-through untranslated', () => {
    // Anything but a bare "$1" would corrupt text taken verbatim from axe.
    for (const [locale, catalog] of Object.entries(catalogs)) {
      expect(catalog['literal']?.message, `${locale}.literal must stay "$1"`).toBe('$1')
    }
  })

  it('cover every key the fix-engine emits', () => {
    const missing = [...engineKeys()].filter((key) => !(key in de)).sort()

    expect(missing, `keys emitted by fix-engine but absent from the catalog`).toEqual([])
  })

  it('cover every key the extension resolves', () => {
    const missing = [...panelKeys()].filter((key) => !(key in de)).sort()

    expect(missing, `keys used in the extension but absent from the catalog`).toEqual([])
  })

  it('contain no entry that nothing references', () => {
    const used = referencedKeys()
    // Referenced from manifest.json via __MSG_ rather than from code.
    const fromManifest = ['appName', 'appShortName', 'appDescription', 'actionTitle']
    for (const key of fromManifest) used.add(key)

    const orphans = Object.keys(de)
      .filter((key) => !used.has(key))
      .sort()

    expect(orphans, 'catalog entries nothing references — delete them or wire them up').toEqual([])
  })
})
