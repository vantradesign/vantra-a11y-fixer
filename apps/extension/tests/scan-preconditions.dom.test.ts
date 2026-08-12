/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h } from 'vue'

import { useScan } from '../src/panel/composables/useScan.js'

/**
 * The checks a scan runs before it touches the page.
 *
 * These decide which explanation the user gets, and getting them wrong is how a
 * perfectly scannable tab ends up being reported as missing.
 */

type Scan = ReturnType<typeof useScan>
type Query = { active?: boolean; lastFocusedWindow?: boolean; currentWindow?: boolean }
type Tab = { id?: number; url?: string }

let queries: Query[]

/** Installs a `chrome` stub whose tab query answers per window-selector. */
function stubChrome(answers: { lastFocused?: Tab[]; current?: Tab[] }): void {
  queries = []

  Object.assign(globalThis, {
    chrome: {
      // Resolving keys to themselves is enough: these tests assert on reasons,
      // not on wording. The catalog itself is covered by catalog.test.ts.
      i18n: { getMessage: (key: string) => key, getUILanguage: () => 'de-DE' },
      storage: { local: { get: async () => ({}), set: async () => undefined } },
      runtime: { onMessage: { addListener: () => undefined } },
      scripting: { executeScript: vi.fn(async () => []) },
      tabs: {
        query: async (query: Query): Promise<Tab[]> => {
          queries.push(query)
          if (query.lastFocusedWindow === true) return answers.lastFocused ?? []
          return answers.current ?? []
        },
        sendMessage: vi.fn(async () => undefined),
      },
    },
  })
}

/**
 * Runs the composable inside a real component, so `onMounted` fires as it does
 * in the panel rather than being skipped with a warning.
 */
async function mountScan(): Promise<Scan> {
  let api: Scan | undefined

  const app = createApp(
    defineComponent({
      setup() {
        api = useScan()
        return () => h('div')
      },
    }),
  )
  app.mount(document.createElement('div'))

  // Let the mounted hook's awaits settle before the test drives the API.
  await Promise.resolve()

  if (api === undefined) throw new Error('composable did not initialise')
  return api
}

describe('scan preconditions', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('reports no active tab when the browser hands back none', async () => {
    stubChrome({})
    const scan = await mountScan()

    await scan.scan()

    expect(scan.error.value?.reason).toBe('no-active-tab')
  })

  it('distinguishes a tab we may not touch from a tab that is not there', async () => {
    // A visible tab whose URL is withheld means `activeTab` was never granted.
    // Calling that "no active tab" sends the user hunting for a tab in plain
    // sight, which is exactly the bug this separation fixes.
    stubChrome({ lastFocused: [{ id: 7 }] })
    const scan = await mountScan()

    await scan.scan()

    expect(scan.error.value?.reason).toBe('tab-not-accessible')
  })

  it('names the restricted page when the URL is one the browser blocks', async () => {
    stubChrome({ lastFocused: [{ id: 7, url: 'chrome://settings' }] })
    const scan = await mountScan()

    await scan.scan()

    expect(scan.error.value?.reason).toBe('restricted-page')
  })

  it('falls back to currentWindow when lastFocusedWindow yields nothing', async () => {
    // A side panel has no window of its own, so neither selector can be relied
    // on alone.
    stubChrome({ lastFocused: [], current: [{ id: 7, url: 'https://example.com' }] })
    const scan = await mountScan()

    await scan.scan()

    expect(scan.error.value).toBeNull()
    expect(scan.state.value).toBe('scanning')
    // First the docked window, then the fallback — and nothing beyond that.
    expect(queries).toEqual([
      { active: true, lastFocusedWindow: true },
      { active: true, currentWindow: true },
    ])
  })

  it('starts a scan on an ordinary page', async () => {
    stubChrome({ lastFocused: [{ id: 7, url: 'https://example.com' }] })
    const scan = await mountScan()

    await scan.scan()

    expect(scan.error.value).toBeNull()
    expect(scan.state.value).toBe('scanning')
  })

  it('addresses the tab it checked, without resolving it a second time', async () => {
    // Resolving again between the injection and the message would let a tab
    // switch redirect SCAN_START to a different page, and its findings would be
    // filed under the URL the panel had already vetted.
    stubChrome({ lastFocused: [{ id: 7, url: 'https://example.com' }] })
    const scan = await mountScan()

    await scan.scan()

    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ type: 'SCAN_START' }),
    )
    expect(queries).toHaveLength(1)
  })
})
