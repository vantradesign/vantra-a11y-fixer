<!--
  This Source Code Form is subject to the terms of the Mozilla Public
  License, v. 2.0. If a copy of the MPL was not distributed with this
  file, You can obtain one at https://mozilla.org/MPL/2.0/.
-->
<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Category } from '@vantra-a11y/protocol'

import ClusterCard from './components/ClusterCard.vue'
import IssueDetail from './components/IssueDetail.vue'
import NetworkZero from './components/NetworkZero.vue'
import SettingsView from './components/SettingsView.vue'
import { useScan } from './composables/useScan.js'
import { CATEGORY_KEY, plural, t } from '../shared/i18n.js'
import type { MessageKey } from '../shared/i18n.js'
import { CATEGORY_GLYPH } from './labels.js'

type View = 'overview' | 'settings' | 'privacy'

const VIEWS: View[] = ['overview', 'settings', 'privacy']

const VIEW_KEY: Record<View, MessageKey> = {
  overview: 'navOverview',
  settings: 'navSettings',
  privacy: 'navPrivacy',
}

const {
  state,
  result,
  settings,
  errorText,
  error,
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
} = useScan()

const view = ref<View>('overview')

const CATEGORIES: Category[] = ['contrast', 'semantics', 'structure', 'interaction', 'manual']

const scannedHost = computed(() => {
  if (!result.value) return ''
  try {
    const url = new URL(result.value.url)
    return `${url.hostname}${url.pathname}`
  } catch {
    return result.value.url
  }
})

const scannedTime = computed(() =>
  result.value
    ? // Follow the extension's UI language, not a fixed locale, so the time
      // format matches the rest of the panel.
      new Date(result.value.scannedAt).toLocaleTimeString(chrome.i18n.getUILanguage(), {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '',
)

const previewsActive = computed(() =>
  plural(appliedProposalIds.value.length, 'previewsActiveOne', 'previewsActiveOther'),
)

const manualReviewNote = computed(() =>
  plural(result.value?.needsManualReview ?? 0, 'manualReviewNoteOne', 'manualReviewNoteOther'),
)

/**
 * Findings the pixel measurement settled as sufficient.
 *
 * Stated explicitly because they were removed from the list on our judgement.
 * A count that silently shrinks looks like a tool losing findings.
 */
const measuredClearedNote = computed(() =>
  plural(result.value?.pixelCleared ?? 0, 'measuredClearedNoteOne', 'measuredClearedNote'),
)

function toggleFilter(category: Category): void {
  categoryFilter.value = categoryFilter.value === category ? null : category
}
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <!-- Scan status for screen readers; visually conveyed by the button label. -->
    <p aria-live="polite" class="sr-only">{{ announcement }}</p>

    <header class="sticky top-0 z-10 border-b border-vantra-ink/20 bg-vantra-paper">
      <div class="flex items-center justify-between gap-2 px-3 py-2">
        <h1 class="text-[15px] font-semibold tracking-tight">
          VANTRA <span class="font-normal text-vantra-ink/70">A11y</span>
        </h1>
        <button
          type="button"
          class="min-h-8 rounded bg-vantra-blue px-3 py-1 text-[13px] font-medium text-white hover:bg-vantra-ink disabled:opacity-60"
          :disabled="state === 'scanning'"
          @click="scan()"
        >
          {{ state === 'scanning' ? t('btnScanning') : t('btnScan') }}
        </button>
      </div>

      <nav :aria-label="t('navSections')" class="flex gap-1 px-3 pb-2">
        <button
          v-for="tab in VIEWS"
          :key="tab"
          type="button"
          class="min-h-7 rounded px-2 py-0.5 text-[12px] font-medium"
          :class="view === tab ? 'bg-vantra-ink text-vantra-paper' : 'text-vantra-ink/75 hover:bg-vantra-mist'"
          :aria-current="view === tab ? 'page' : undefined"
          @click="view = tab"
        >
          {{ t(VIEW_KEY[tab]) }}
        </button>
      </nav>
    </header>

    <main class="flex-1">
      <SettingsView
        v-if="view === 'settings'"
        :settings="settings"
        @update="updateSettings($event)"
      />

      <NetworkZero v-else-if="view === 'privacy'" />

      <IssueDetail
        v-else-if="activeCluster"
        :cluster="activeCluster"
        :applied-proposal-ids="appliedProposalIds"
        @back="activeClusterId = null"
        @show="showInPage($event)"
        @toggle="togglePreview(activeCluster, $event)"
      />

      <div v-else>
        <div v-if="state === 'idle'" class="px-3 py-6 text-[13px] leading-relaxed">
          <p class="font-medium">{{ t('emptyIdleTitle') }}</p>
          <p class="mt-1.5 text-vantra-ink/80">{{ t('emptyIdleBody') }}</p>
        </div>

        <div v-else-if="state === 'scanning'" class="px-3 py-6 text-[13px]">
          <p>{{ phase === 'measuring' ? t('scanningMeasuring') : t('scanningBody') }}</p>
        </div>

        <div v-else-if="state === 'error'" class="px-3 py-6 text-[13px] leading-relaxed">
          <p class="font-medium">{{ t('errorTitle') }}</p>
          <p class="mt-1.5 text-vantra-ink/80">{{ errorText }}</p>
          <p v-if="error?.detail" class="mt-1.5 font-mono text-[12px] text-vantra-ink/70">
            {{ error.detail }}
          </p>
        </div>

        <div v-else-if="state === 'stale'" class="px-3 py-6 text-[13px] leading-relaxed">
          <p class="font-medium">{{ t('staleTitle') }}</p>
          <p class="mt-1.5 text-vantra-ink/80">{{ t('staleBody') }}</p>
        </div>

        <template v-else-if="result">
          <div class="border-b border-vantra-ink/15 px-3 py-2 text-[12px] text-vantra-ink/75">
            <p class="break-all">{{ scannedHost }}</p>
            <p class="mt-0.5">
              {{
                t('summaryMeta', [
                  scannedTime,
                  String(result.elementCount),
                  result.targetLevel,
                  result.axeVersion,
                ])
              }}
            </p>
          </div>

          <div class="grid grid-cols-2 gap-1.5 px-3 py-2.5">
            <button
              v-for="category in CATEGORIES"
              :key="category"
              type="button"
              class="flex min-h-11 flex-col items-start rounded border px-2 py-1.5 text-left"
              :class="
                categoryFilter === category
                  ? 'border-vantra-blue bg-vantra-mist'
                  : 'border-vantra-ink/20 hover:bg-vantra-mist/50'
              "
              :aria-pressed="categoryFilter === category"
              @click="toggleFilter(category)"
            >
              <span class="text-[16px] font-semibold leading-none">
                {{ countsByCategory[category] }}
              </span>
              <span class="mt-0.5 text-[11px] leading-tight text-vantra-ink/80">
                <span aria-hidden="true">{{ CATEGORY_GLYPH[category] }}</span>
                {{ t(CATEGORY_KEY[category]) }}
              </span>
            </button>
          </div>

          <p
            v-if="appliedProposalIds.length > 0"
            class="flex items-center justify-between gap-2 border-y border-vantra-ink/15 bg-vantra-mist px-3 py-1.5 text-[12px]"
          >
            <span>{{ previewsActive }}</span>
            <button type="button" class="min-h-6 font-medium text-vantra-blue underline" @click="revertAll()">
              {{ t('btnRevertAll') }}
            </button>
          </p>

          <div v-if="result.clusters.length === 0" class="px-3 py-6 text-[13px] leading-relaxed">
            <p class="font-medium">{{ t('emptyResultTitle') }}</p>
            <!-- Deliberately not "the page is accessible": automated checks only
                 cover part of WCAG. Saying otherwise would be the single most
                 harmful thing this tool could do. -->
            <p class="mt-1.5 text-vantra-ink/80">{{ t('emptyResultBody') }}</p>
          </div>

          <div v-else>
            <p class="px-3 pb-1 text-[11px] uppercase tracking-wide text-vantra-ink/60">
              {{ t('sortedBySeverity') }}
            </p>
            <ul role="list">
              <li v-for="cluster in visibleClusters" :key="cluster.id">
                <ClusterCard :cluster="cluster" @open="activeClusterId = cluster.id" />
              </li>
            </ul>

            <p
              v-if="result.needsManualReview > 0"
              class="px-3 py-3 text-[12px] leading-relaxed text-vantra-ink/75"
            >
              {{ manualReviewNote }}
            </p>

            <p
              v-if="(result.pixelCleared ?? 0) > 0"
              class="px-3 pb-3 text-[12px] leading-relaxed text-vantra-ink/75"
            >
              {{ measuredClearedNote }}
            </p>
          </div>
        </template>
      </div>
    </main>
  </div>
</template>
