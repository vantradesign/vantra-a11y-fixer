/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { computed, onMounted, ref, shallowRef } from 'vue'
import type {
  Category,
  FixProposal,
  IssueCluster,
  PageMessage,
  PanelMessage,
  ScanErrorReason,
  ScanResult,
  Settings,
} from '@vantra-a11y/protocol'
import { DEFAULT_SETTINGS } from '@vantra-a11y/protocol'

import { t } from '../../shared/i18n.js'
import type { MessageKey } from '../../shared/i18n.js'
import { isRestrictedUrl } from '../../shared/restricted-url.js'
import { loadSettings, saveSettings } from '../../shared/storage.js'

export type ScanState = 'idle' | 'scanning' | 'done' | 'error' | 'stale'

const ERROR_KEY: Record<ScanErrorReason, MessageKey> = {
  'restricted-page': 'errorRestrictedPage',
  'no-active-tab': 'errorNoActiveTab',
  'tab-not-accessible': 'errorTabNotAccessible',
  'injection-failed': 'errorInjectionFailed',
  'axe-failed': 'errorAxeFailed',
}

export function useScan() {
  const state = ref<ScanState>('idle')
  const result = shallowRef<ScanResult | null>(null)
  const settings = ref<Settings>(DEFAULT_SETTINGS)
  const error = ref<{ reason: ScanErrorReason; detail?: string } | null>(null)
  const progress = ref(0)
  /**
   * Which part of the scan is running. Surfaced because pixel measurement takes
   * seconds on a long page, and a progress bar that stalls without saying why
   * reads as a hang.
   */
  const phase = ref<'injecting' | 'analysing' | 'measuring' | 'proposing'>('injecting')
  const appliedProposalIds = ref<string[]>([])
  const activeClusterId = ref<string | null>(null)
  const categoryFilter = ref<Category | null>(null)
  /** Screen-reader announcement for the scan lifecycle (`aria-live`). */
  const announcement = ref('')

  const activeCluster = computed(
    () => result.value?.clusters.find((cluster) => cluster.id === activeClusterId.value) ?? null,
  )

  const visibleClusters = computed(() => {
    const clusters = result.value?.clusters ?? []
    if (!categoryFilter.value) return clusters
    return clusters.filter((cluster) => cluster.category === categoryFilter.value)
  })

  const countsByCategory = computed(() => {
    const counts: Record<Category, number> = {
      contrast: 0,
      semantics: 0,
      structure: 0,
      interaction: 0,
      manual: 0,
    }
    for (const cluster of result.value?.clusters ?? []) {
      counts[cluster.category] += cluster.occurrences.length
    }
    return counts
  })

  const errorText = computed(() => (error.value ? t(ERROR_KEY[error.value.reason]) : ''))

  /**
   * Window of the tab being scanned, remembered so viewport captures photograph
   * that window rather than whichever one the browser considers current.
   */
  let scanWindowId: number | undefined

  /**
   * The tab the user is looking at.
   *
   * A side panel is not a tab and has no window of its own, so `currentWindow`
   * can resolve to nothing at all. `lastFocusedWindow` points at the browser
   * window the panel is docked to, which is what we actually mean; the second
   * query is kept as a fallback for contexts where that is unset.
   */
  async function activeTab(): Promise<chrome.tabs.Tab | null> {
    for (const query of [{ lastFocusedWindow: true }, { currentWindow: true }]) {
      const [tab] = await chrome.tabs.query({ active: true, ...query })
      if (tab) return tab
    }
    return null
  }

  /**
   * Sends a message to the page.
   *
   * `tabId` is passed explicitly wherever the caller has already resolved a tab.
   * Re-resolving here would open a window in which the user switches tabs, and
   * the message would then reach a page other than the one that was checked and
   * injected — findings attributed to the wrong URL.
   */
  async function sendToPage(message: PanelMessage, tabId?: number): Promise<boolean> {
    const id = tabId ?? (await activeTab())?.id
    if (id === undefined) return false
    try {
      await chrome.tabs.sendMessage(id, message)
      return true
    } catch {
      return false
    }
  }

  async function scan(): Promise<void> {
    const tab = await activeTab()
    if (!tab?.id) {
      state.value = 'error'
      error.value = { reason: 'no-active-tab' }
      return
    }

    // A tab we can see but whose URL is hidden means `activeTab` was never
    // granted for it — the extension was not invoked on this tab, or the grant
    // lapsed on navigation. Reporting that as "no active tab" sends the user
    // looking for a tab that is plainly right there.
    if (!tab.url) {
      state.value = 'error'
      error.value = { reason: 'tab-not-accessible' }
      return
    }

    if (isRestrictedUrl(tab.url)) {
      state.value = 'error'
      error.value = { reason: 'restricted-page' }
      return
    }

    scanWindowId = tab.windowId

    state.value = 'scanning'
    error.value = null
    progress.value = 5
    phase.value = 'injecting'
    announcement.value = t('announceScanning')
    activeClusterId.value = null

    try {
      // Injected on demand under `activeTab`, so the extension holds no standing
      // permission for any site.
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: false },
        files: ['content.js'],
      })
    } catch {
      state.value = 'error'
      error.value = { reason: 'injection-failed' }
      return
    }

    const delivered = await sendToPage({ type: 'SCAN_START', settings: settings.value }, tab.id)
    if (!delivered) {
      state.value = 'error'
      error.value = { reason: 'injection-failed' }
    }
  }

  async function updateSettings(next: Settings): Promise<void> {
    settings.value = next
    await saveSettings(next)
    await sendToPage({ type: 'SETTINGS_CHANGED', settings: next })
  }

  async function showInPage(selector: string): Promise<void> {
    await sendToPage({ type: 'HIGHLIGHT', selector })
  }

  async function togglePreview(cluster: IssueCluster, proposal: FixProposal): Promise<void> {
    const selector = cluster.occurrences[0]?.selector
    if (!selector) return

    if (appliedProposalIds.value.includes(proposal.id)) {
      await sendToPage({
        type: 'REVERT_PREVIEW',
        clusterId: cluster.id,
        proposalId: proposal.id,
        selector,
      })
      return
    }

    await sendToPage({
      type: 'APPLY_PREVIEW',
      clusterId: cluster.id,
      proposalId: proposal.id,
      selector,
    })
  }

  async function revertAll(): Promise<void> {
    await sendToPage({ type: 'REVERT_ALL' })
  }

  onMounted(async () => {
    settings.value = await loadSettings()

    chrome.runtime.onMessage.addListener((message: PageMessage, _sender, respond) => {
      switch (message.type) {
        case 'CAPTURE_VIEWPORT':
          // Content scripts may not photograph their own tab, so the page asks us.
          // The window is named explicitly: a side panel has no unambiguous
          // "current window", the same trap that made tab lookup fail.
          void chrome.tabs
            .captureVisibleTab(scanWindowId ?? chrome.windows.WINDOW_ID_CURRENT, {
              format: 'png',
            })
            .then((dataUrl) => respond(dataUrl))
            .catch(() => respond(null))
          // Keeps the message channel open for the asynchronous reply.
          return true

        case 'SCAN_PROGRESS':
          progress.value = message.percent
          phase.value = message.phase
          break

        case 'SCAN_RESULT':
          result.value = message.result
          state.value = 'done'
          progress.value = 100
          announcement.value = t('announceDone', [
            String(message.result.clusters.length),
            String(message.result.needsManualReview),
          ])
          break

        case 'SCAN_ERROR':
          state.value = 'error'
          error.value = { reason: message.reason, detail: message.detail }
          announcement.value = t('announceError')
          break

        case 'PREVIEW_STATE':
          appliedProposalIds.value = message.appliedProposalIds
          break

        case 'PAGE_NAVIGATED':
          // Never keep showing findings for a page that is gone.
          if (state.value === 'done') {
            state.value = 'stale'
            announcement.value = t('announceStale')
          }
          appliedProposalIds.value = []
          break
      }

      return false
    })
  })

  return {
    state,
    result,
    settings,
    error,
    errorText,
    progress,
    appliedProposalIds,
    activeClusterId,
    activeCluster,
    categoryFilter,
    countsByCategory,
    visibleClusters,
    announcement,
    phase,
    scan,
    updateSettings,
    showInPage,
    togglePreview,
    revertAll,
  }
}
