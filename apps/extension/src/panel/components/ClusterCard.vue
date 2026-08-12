<!--
  This Source Code Form is subject to the terms of the Mozilla Public
  License, v. 2.0. If a copy of the MPL was not distributed with this
  file, You can obtain one at https://mozilla.org/MPL/2.0/.
-->
<script setup lang="ts">
import { computed } from 'vue'
import type { IssueCluster } from '@vantra-a11y/protocol'

import { CATEGORY_KEY, plural, SEVERITY_KEY, t, tt } from '../../shared/i18n.js'
import { CATEGORY_GLYPH } from '../labels.js'

const props = defineProps<{ cluster: IssueCluster }>()
defineEmits<{ open: [] }>()

const elementCount = computed(() =>
  plural(props.cluster.occurrences.length, 'countElementsOne', 'countElementsOther'),
)
const proposalCount = computed(() => props.cluster.proposals.length)
const proposalCountLabel = computed(() =>
  plural(proposalCount.value, 'countProposalsOne', 'countProposalsOther'),
)

const severityClass: Record<string, string> = {
  critical: 'text-severity-critical',
  high: 'text-severity-high',
  medium: 'text-severity-medium',
  advisory: 'text-severity-advisory',
  manual: 'text-severity-manual',
}
</script>

<template>
  <!-- A real button, so keyboard and screen-reader users get the same affordance
       as mouse users. Min height keeps the target above 24px (SC 2.5.8). -->
  <button
    type="button"
    class="flex w-full min-h-11 flex-col items-start gap-1 border-b border-vantra-ink/10 px-3 py-2.5 text-left hover:bg-vantra-mist/40"
    @click="$emit('open')"
  >
    <span class="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold uppercase tracking-wide">
      <span :class="severityClass[cluster.severity]">{{ t(SEVERITY_KEY[cluster.severity]) }}</span>
      <span aria-hidden="true" class="text-vantra-ink/30">·</span>
      <span class="text-vantra-ink/70">
        <span aria-hidden="true">{{ CATEGORY_GLYPH[cluster.category] }}</span>
        {{ t(CATEGORY_KEY[cluster.category]) }}
      </span>
    </span>

    <span class="text-[14px] font-medium leading-snug">{{ tt(cluster.title) }}</span>

    <span class="flex flex-wrap items-center gap-x-2 text-[12px] text-vantra-ink/70">
      <span>{{ elementCount }}</span>
      <span aria-hidden="true">·</span>
      <span v-if="proposalCount > 0">{{ proposalCountLabel }}</span>
      <span v-else class="italic">{{ t('manualGuidanceTag') }}</span>
      <span aria-hidden="true">·</span>
      <span class="font-mono">SC {{ cluster.wcag.sc }} {{ cluster.wcag.level }}</span>
    </span>
  </button>
</template>
