/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { computed, onMounted, ref, shallowRef } from 'vue'
import type {
  EmpathyPageMessage,
  EmpathyPlaybackState,
  StructureReport,
  TraversalResult,
} from '../../shared/empathy-types.js'
import { isRestrictedUrl } from '../../shared/restricted-url.js'
import { t } from '../../shared/i18n.js'
import type { MessageKey } from '../../shared/i18n.js'

export type EmpathyState = 'idle' | 'analyzing' | 'done' | 'error'

export function useEmpathy() {
  const state = ref<EmpathyState>('idle')
  const traversal = shallowRef<TraversalResult | null>(null)
  const structure = shallowRef<StructureReport | null>(null)
  const errorDetail = ref('')
  const playback = ref<EmpathyPlaybackState>('idle')
  const currentIndex = ref(0)
  const announcement = ref('')

  const totalEntries = computed(() => traversal.value?.entries.length ?? 0)
  const currentEntry = computed(() =>
    traversal.value?.entries[currentIndex.value] ?? null,
  )

  /** The tab the user is looking at (same logic as useScan). */
  async function activeTab(): Promise<chrome.tabs.Tab | null> {
    for (const query of [{ lastFocusedWindow: true }, { currentWindow: true }]) {
      const [tab] = await chrome.tabs.query({ active: true, ...query })
      if (tab) return tab
    }
    return null
  }

  async function sendToPage(
    message: { type: string; [key: string]: unknown },
    tabId?: number,
  ): Promise<boolean> {
    const id = tabId ?? (await activeTab())?.id
    if (id === undefined) return false
    try {
      await chrome.tabs.sendMessage(id, message)
      return true
    } catch {
      return false
    }
  }

  async function analyze(): Promise<void> {
    const tab = await activeTab()
    if (!tab?.id) {
      state.value = 'error'
      errorDetail.value = t('empathyErrorNoTab' as MessageKey)
      return
    }
    if (!tab.url) {
      state.value = 'error'
      errorDetail.value = t('empathyErrorNotAccessible' as MessageKey)
      return
    }
    if (isRestrictedUrl(tab.url)) {
      state.value = 'error'
      errorDetail.value = t('errorRestrictedPage' as MessageKey)
      return
    }

    state.value = 'analyzing'
    announcement.value = t('empathyAnnounceAnalyzing' as MessageKey)

    // Ensure content script is injected
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: false },
        files: ['content.js'],
      })
    } catch {
      state.value = 'error'
      errorDetail.value = t('errorInjectionFailed' as MessageKey)
      return
    }

    const ok = await sendToPage({ type: 'EMPATHY_START' }, tab.id)
    if (!ok) {
      state.value = 'error'
      errorDetail.value = t('errorInjectionFailed' as MessageKey)
    }
  }

  async function play(): Promise<void> {
    await sendToPage({ type: 'EMPATHY_PLAY' })
  }

  async function pause(): Promise<void> {
    await sendToPage({ type: 'EMPATHY_PAUSE' })
  }

  async function stop(): Promise<void> {
    await sendToPage({ type: 'EMPATHY_STOP' })
  }

  async function seekTo(index: number): Promise<void> {
    await sendToPage({ type: 'EMPATHY_SEEK', index })
  }

  async function highlightInPage(selector: string): Promise<void> {
    await sendToPage({ type: 'EMPATHY_HIGHLIGHT', selector })
  }

  onMounted(() => {
    chrome.runtime.onMessage.addListener((message: EmpathyPageMessage) => {
      switch (message.type) {
        case 'EMPATHY_RESULT':
          traversal.value = message.traversal
          structure.value = message.structure
          state.value = 'done'
          announcement.value = t('empathyAnnounceDone' as MessageKey, [
            String(message.traversal.entries.length),
            String(message.structure.issues.length),
          ])
          break

        case 'EMPATHY_PLAYBACK':
          playback.value = message.state
          currentIndex.value = message.currentIndex
          break

        case 'EMPATHY_ERROR':
          state.value = 'error'
          errorDetail.value = message.detail
          announcement.value = t('announceError' as MessageKey)
          break

        case 'PAGE_NAVIGATED' as EmpathyPageMessage['type']:
          // Reset empathy state when the page navigates
          if (state.value === 'done') {
            state.value = 'idle'
            traversal.value = null
            structure.value = null
            playback.value = 'idle'
            currentIndex.value = 0
          }
          break
      }

      return false
    })
  })

  return {
    state,
    traversal,
    structure,
    errorDetail,
    playback,
    currentIndex,
    totalEntries,
    currentEntry,
    announcement,
    analyze,
    play,
    pause,
    stop,
    seekTo,
    highlightInPage,
  }
}
