/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { ScanResult } from './issue.js'
import type { Settings } from './settings.js'

/** Panel → page direction. */
export type PanelMessage =
  | { type: 'SCAN_START'; settings: Settings }
  | { type: 'HIGHLIGHT'; selector: string }
  | { type: 'APPLY_PREVIEW'; clusterId: string; proposalId: string; selector: string }
  | { type: 'REVERT_PREVIEW'; clusterId: string; proposalId: string; selector: string }
  | { type: 'REVERT_ALL' }
  | { type: 'SETTINGS_CHANGED'; settings: Settings }

/** Page → panel direction. */
export type PageMessage =
  | {
      type: 'SCAN_PROGRESS'
      phase: 'injecting' | 'analysing' | 'measuring' | 'proposing'
      percent: number
    }
  /**
   * Asks the panel for a screenshot of the visible viewport.
   *
   * Only extension pages may call `chrome.tabs.captureVisibleTab`, so the content
   * script cannot take its own picture and has to ask. The reply is a PNG data
   * URL, or `null` when the capture failed or was refused.
   */
  | { type: 'CAPTURE_VIEWPORT' }
  | { type: 'SCAN_RESULT'; result: ScanResult }
  | { type: 'SCAN_ERROR'; reason: ScanErrorReason; detail?: string }
  | { type: 'PREVIEW_STATE'; appliedProposalIds: string[] }
  /**
   * Sent when the tab navigates. The panel must discard its result rather than
   * keep showing findings for a page that is no longer there.
   */
  | { type: 'PAGE_NAVIGATED'; url: string }

export type ScanErrorReason =
  /** `chrome://`, the Web Store, PDF viewer and friends cannot be scripted. */
  | 'restricted-page'
  | 'no-active-tab'
  /**
   * The tab is visible but its URL is not, so `activeTab` was never granted for
   * it. Distinct from `no-active-tab`: there *is* a tab, it just is not ours to
   * touch until the user invokes the extension on it.
   */
  | 'tab-not-accessible'
  | 'injection-failed'
  | 'axe-failed'

export type Message = PanelMessage | PageMessage

export const PORT_NAME = 'vantra-a11y'

export function isPanelMessage(message: Message): message is PanelMessage {
  return (
    message.type === 'SCAN_START' ||
    message.type === 'HIGHLIGHT' ||
    message.type === 'APPLY_PREVIEW' ||
    message.type === 'REVERT_PREVIEW' ||
    message.type === 'REVERT_ALL' ||
    message.type === 'SETTINGS_CHANGED'
  )
}
