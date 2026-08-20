<!--
  This Source Code Form is subject to the terms of the Mozilla Public
  License, v. 2.0. If a copy of the MPL was not distributed with this
  file, You can obtain one at https://mozilla.org/MPL/2.0/.
-->
<script setup lang="ts">
import { computed, ref } from 'vue'
import type {
  EmpathyPlaybackState,
  StructureReport,
  TraversalEntry,
  TraversalResult,
} from '../../shared/empathy-types.js'
import { formatEntryForSpeech } from '../../shared/empathy-speech.js'
import { t } from '../../shared/i18n.js'
import type { MessageKey } from '../../shared/i18n.js'

const props = defineProps<{
  traversal: TraversalResult
  structure: StructureReport
  playback: EmpathyPlaybackState
  currentIndex: number
}>()

const emit = defineEmits<{
  play: []
  pause: []
  stop: []
  seek: [index: number]
  highlight: [selector: string]
}>()

type Tab = 'structure' | 'reading'
const activeTab = ref<Tab>('structure')

const scoreColor = computed(() => {
  const s = props.structure.score
  if (s >= 70) return 'var(--color-severity-advisory)'
  if (s >= 50) return 'var(--color-severity-medium)'
  return 'var(--color-severity-critical)'
})

const flaggedEntries = computed(() =>
  props.traversal.entries.filter(e => e.flags.length > 0),
)

function severityClass(severity: string): string {
  const map: Record<string, string> = {
    critical: 'text-severity-critical',
    serious: 'text-severity-critical',
    moderate: 'text-severity-medium',
    minor: 'text-severity-advisory',
  }
  return map[severity] ?? 'text-severity-advisory'
}

function roleDisplay(entry: TraversalEntry): string {
  if (entry.role === 'heading' && entry.level) return `h${entry.level}`
  return entry.role
}
</script>

<template>
  <div class="flex flex-col">
    <!-- Playback controls -->
    <div class="sticky top-0 z-10 border-b border-vantra-ink/15 bg-vantra-paper px-3 py-2">
      <div class="flex items-center gap-2">
        <button
          v-if="playback === 'idle' || playback === 'paused'"
          type="button"
          class="min-h-8 rounded bg-vantra-blue px-3 py-1 text-[13px] font-medium text-white hover:bg-vantra-ink"
          @click="emit('play')"
        >
          {{ playback === 'paused' ? t('empathyBtnResume' as MessageKey) : t('empathyBtnPlay' as MessageKey) }}
        </button>
        <button
          v-if="playback === 'playing'"
          type="button"
          class="min-h-8 rounded border border-vantra-blue px-3 py-1 text-[13px] font-medium text-vantra-blue hover:bg-vantra-mist"
          @click="emit('pause')"
        >
          {{ t('empathyBtnPause' as MessageKey) }}
        </button>
        <button
          v-if="playback !== 'idle'"
          type="button"
          class="min-h-8 rounded border border-vantra-ink/30 px-3 py-1 text-[13px] text-vantra-ink/75 hover:bg-vantra-mist"
          @click="emit('stop')"
        >
          {{ t('empathyBtnStop' as MessageKey) }}
        </button>

        <span
          v-if="playback !== 'idle'"
          class="ml-auto text-[12px] text-vantra-ink/70"
        >
          {{ currentIndex + 1 }} / {{ traversal.entries.length }}
        </span>
      </div>
    </div>

    <!-- Score summary -->
    <div class="border-b border-vantra-ink/15 px-3 py-2">
      <div class="flex items-baseline gap-3">
        <span class="text-[24px] font-bold" :style="{ color: scoreColor }">
          {{ structure.score }}
        </span>
        <span class="text-[13px] font-medium">
          {{ t('empathyBand' as MessageKey) }}:
          <span class="font-semibold">{{ structure.band }}</span>
        </span>
      </div>
      <div class="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-vantra-ink/70">
        <span>{{ traversal.entries.length }} {{ t('empathyStatElements' as MessageKey) }}</span>
        <span>{{ structure.landmarks.length }} {{ t('empathyStatLandmarks' as MessageKey) }}</span>
        <span>{{ structure.elementsBeforeMain }} {{ t('empathyStatBeforeMain' as MessageKey) }}</span>
        <span>{{ structure.issues.length }} {{ t('empathyStatIssues' as MessageKey) }}</span>
      </div>
    </div>

    <!-- Tabs -->
    <div class="flex gap-1 border-b border-vantra-ink/15 px-3 py-1.5">
      <button
        v-for="tab in (['structure', 'reading'] as Tab[])"
        :key="tab"
        type="button"
        class="min-h-7 rounded px-2 py-0.5 text-[12px] font-medium"
        :class="activeTab === tab ? 'bg-vantra-ink text-vantra-paper' : 'text-vantra-ink/75 hover:bg-vantra-mist'"
        :aria-current="activeTab === tab ? 'page' : undefined"
        @click="activeTab = tab"
      >
        {{ tab === 'structure' ? t('empathyTabStructure' as MessageKey) : t('empathyTabReading' as MessageKey) }}
      </button>
    </div>

    <!-- Structure tab -->
    <div v-if="activeTab === 'structure'" class="space-y-3 px-3 py-3">
      <!-- Issues -->
      <section v-if="structure.issues.length > 0" aria-labelledby="empathy-issues-heading">
        <h3 id="empathy-issues-heading" class="text-[13px] font-semibold">
          {{ t('empathyHeadingIssues' as MessageKey) }}
        </h3>
        <ul class="mt-1.5 space-y-1.5">
          <li
            v-for="issue in structure.issues"
            :key="issue.code"
            class="rounded border border-vantra-ink/15 px-2 py-1.5 text-[12px]"
          >
            <div class="flex items-center gap-2">
              <span class="text-[11px] font-semibold uppercase" :class="severityClass(issue.severity)">
                {{ issue.severity }}
              </span>
              <span>{{ issue.message }}</span>
              <span v-if="issue.count > 1" class="ml-auto shrink-0 text-vantra-ink/60">
                ×{{ issue.count }}
              </span>
            </div>
          </li>
        </ul>
      </section>

      <section v-else class="text-[13px] text-vantra-ink/70">
        <p>{{ t('empathyNoIssues' as MessageKey) }}</p>
      </section>

      <!-- Heading outline -->
      <section v-if="structure.headingTree.length > 0" aria-labelledby="empathy-headings-heading">
        <h3 id="empathy-headings-heading" class="text-[13px] font-semibold">
          {{ t('empathyHeadingOutline' as MessageKey) }}
        </h3>
        <ul class="mt-1.5 space-y-0.5 text-[12px]">
          <template v-for="(node, i) in structure.headingTree" :key="i">
            <li class="flex items-center gap-1.5">
              <span class="shrink-0 rounded bg-vantra-mist px-1 py-0.5 font-mono text-[11px]">
                h{{ node.level }}
              </span>
              <span>{{ node.name || '(empty)' }}</span>
            </li>
          </template>
        </ul>
      </section>

      <!-- Landmarks -->
      <section v-if="structure.landmarks.length > 0" aria-labelledby="empathy-landmarks-heading">
        <h3 id="empathy-landmarks-heading" class="text-[13px] font-semibold">
          {{ t('empathyHeadingLandmarks' as MessageKey) }}
        </h3>
        <ul class="mt-1.5 space-y-0.5 text-[12px]">
          <li v-for="(lm, i) in structure.landmarks" :key="i" class="flex items-center gap-1.5">
            <span class="shrink-0 rounded bg-vantra-mist px-1 py-0.5 font-mono text-[11px]">
              {{ lm.role }}
            </span>
            <span>{{ lm.label || t('empathyNoLabel' as MessageKey) }}</span>
          </li>
        </ul>
      </section>
    </div>

    <!-- Reading order tab -->
    <div v-if="activeTab === 'reading'" class="px-3 py-3">
      <p class="mb-2 text-[12px] text-vantra-ink/60">
        {{ traversal.entries.length }} {{ t('empathyStatElements' as MessageKey) }}
        ·
        {{ flaggedEntries.length }} {{ t('empathyWithFlags' as MessageKey) }}
      </p>

      <ol class="space-y-px">
        <li
          v-for="entry in traversal.entries"
          :key="entry.index"
          class="flex min-h-7 items-start gap-2 rounded px-1.5 py-1 text-[12px]"
          :class="[
            currentIndex === entry.index && playback !== 'idle' ? 'bg-vantra-mist' : '',
            entry.flags.length > 0 ? 'border-l-2 border-severity-critical/40' : '',
          ]"
        >
          <span class="w-6 shrink-0 text-right font-mono text-[11px] text-vantra-ink/40">
            {{ entry.index }}
          </span>
          <span class="shrink-0 rounded bg-vantra-ink/8 px-1 py-0.5 font-mono text-[11px]">
            {{ roleDisplay(entry) }}
          </span>
          <button
            type="button"
            class="flex-1 text-left hover:underline"
            :title="formatEntryForSpeech(entry)"
            @click="emit('highlight', entry.selector); emit('seek', entry.index)"
          >
            <span v-if="entry.accessibleName">{{ entry.accessibleName }}</span>
            <span v-else class="italic text-vantra-ink/50">
              {{ entry.flags.length > 0 ? t('empathyMissingName' as MessageKey) : '—' }}
            </span>
          </button>
          <span
            v-if="entry.flags.length > 0"
            class="shrink-0 text-[11px] text-severity-critical"
            :title="entry.flags.map(f => f.message).join('\n')"
          >
            {{ entry.flags.length }}
          </span>
        </li>
      </ol>
    </div>

    <!-- Warnings -->
    <div
      v-if="traversal.warnings.length > 0"
      class="border-t border-vantra-ink/15 px-3 py-2 text-[12px] text-vantra-ink/70"
    >
      <p v-for="w in traversal.warnings" :key="w.code">{{ w.message }}</p>
    </div>
  </div>
</template>
