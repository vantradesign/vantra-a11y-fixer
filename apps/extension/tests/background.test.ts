/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Guards how the toolbar click is handled, which is not a stylistic choice.
 *
 * Letting `openPanelOnActionClick` open the panel is the obvious-looking
 * simplification, and it silently breaks the whole tool: the browser consumes
 * the click, `action.onClicked` never fires, and the `activeTab` grant that the
 * click would have produced is never issued. The panel then cannot read the
 * tab's URL, so no scan can start.
 *
 * These tests exist so that simplification cannot come back unnoticed.
 */

interface Stub {
  installed: Array<() => void>
  clicked: Array<(tab: { id?: number }) => void>
  setPanelBehavior: ReturnType<typeof vi.fn>
  open: ReturnType<typeof vi.fn>
}

function stubChrome(): Stub {
  const stub: Stub = {
    installed: [],
    clicked: [],
    setPanelBehavior: vi.fn(async () => undefined),
    open: vi.fn(async () => undefined),
  }

  Object.assign(globalThis, {
    chrome: {
      runtime: {
        onInstalled: { addListener: (fn: () => void) => stub.installed.push(fn) },
        onMessage: { addListener: () => undefined },
        sendMessage: vi.fn(async () => undefined),
      },
      action: { onClicked: { addListener: (fn: (tab: { id?: number }) => void) => stub.clicked.push(fn) } },
      sidePanel: { setPanelBehavior: stub.setPanelBehavior, open: stub.open },
      tabs: { onUpdated: { addListener: () => undefined } },
    },
  })

  return stub
}

/** Imports the service worker fresh, so its top-level registrations re-run. */
async function loadWorker(): Promise<void> {
  vi.resetModules()
  await import('../src/background/index.js')
}

describe('service worker', () => {
  let stub: Stub

  beforeEach(() => {
    stub = stubChrome()
  })

  it('handles the action click itself instead of letting the browser open the panel', async () => {
    await loadWorker()

    expect(
      stub.clicked.length,
      'no action.onClicked listener — the activeTab grant would never be issued',
    ).toBe(1)
  })

  it('clears openPanelOnActionClick, which persists in the profile from earlier installs', async () => {
    await loadWorker()
    for (const listener of stub.installed) listener()

    expect(stub.setPanelBehavior).toHaveBeenCalledWith({ openPanelOnActionClick: false })
  })

  it('opens the side panel for the tab that was clicked', async () => {
    await loadWorker()
    stub.clicked[0]?.({ id: 42 })

    expect(stub.open).toHaveBeenCalledWith({ tabId: 42 })
  })

  it('does nothing when the click carries no tab id', async () => {
    await loadWorker()
    stub.clicked[0]?.({})

    expect(stub.open).not.toHaveBeenCalled()
  })
})
