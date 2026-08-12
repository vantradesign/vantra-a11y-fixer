/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { PageMessage } from '@vantra-a11y/protocol'

/**
 * The service worker is intentionally thin: it opens the side panel and forwards
 * page messages. All analysis happens in the content script, all rendering in the
 * panel — see docs/ARCHITECTURE.md §1.
 */

// The behaviour is stored in the profile, so an install that once enabled
// `openPanelOnActionClick` keeps swallowing the click even after this code
// stopped asking for it. Clearing it explicitly is what makes a reload of an
// existing install pick up the listener below.
chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false })
})

/**
 * Opens the panel ourselves instead of letting `openPanelOnActionClick` do it.
 *
 * That setting looks simpler, but it makes the browser consume the toolbar click
 * so `onClicked` never fires — and with it the `activeTab` grant that clicking
 * the action would otherwise hand us for the current tab. Without that grant the
 * panel can neither read the tab's URL nor inject the content script, which
 * surfaces as a scan that cannot start at all.
 *
 * Handling the click means we keep `activeTab` and stay free of standing host
 * permissions. `sidePanel.open()` needs a user gesture, which this is.
 */
chrome.action.onClicked.addListener((tab) => {
  if (tab.id === undefined) return
  void chrome.sidePanel.open({ tabId: tab.id }).catch(() => undefined)
})

// Content script → panel. The panel listens on the same runtime channel; this
// listener exists so a message sent while no panel is open is swallowed quietly
// instead of logging an unchecked-error warning.
chrome.runtime.onMessage.addListener((_message: PageMessage, sender) => {
  if (sender.tab === undefined) return false
  return false
})

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== 'loading' || changeInfo.url === undefined) return
  void chrome.runtime
    .sendMessage({ type: 'PAGE_NAVIGATED', url: changeInfo.url, tabId } satisfies PageMessage & {
      tabId: number
    })
    .catch(() => undefined)
})
