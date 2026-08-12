<!--
  This Source Code Form is subject to the terms of the Mozilla Public
  License, v. 2.0. If a copy of the MPL was not distributed with this
  file, You can obtain one at https://mozilla.org/MPL/2.0/.
-->
<script setup lang="ts">
import { computed } from 'vue'
import type { FixProposal } from '@vantra-a11y/protocol'
import { DIFF_ABSENT, DIFF_REMOVED } from '@vantra-a11y/protocol'

import { t } from '../../shared/i18n.js'

const props = defineProps<{ proposal: FixProposal }>()

/**
 * The engine marks "this does not exist" with a sentinel instead of prose, so
 * the wire format stays language-free. Turning it back into words is this
 * component's job.
 */
const cell = (value: string | undefined): string => {
  if (value === undefined) return '—'
  if (value === DIFF_ABSENT) return t('diffAbsent')
  if (value === DIFF_REMOVED) return t('diffRemoved')
  return value
}

const rows = computed(() =>
  Object.keys({ ...props.proposal.before, ...props.proposal.after }).map((key) => ({
    key,
    before: cell(props.proposal.before[key]),
    after: cell(props.proposal.after[key]),
  })),
)

const isColor = (value: string): boolean => /^#[0-9a-f]{3,8}$/i.test(value.trim())

const ratio = (value: number): string => `${value.toFixed(2)}:1`
</script>

<template>
  <div class="rounded border border-vantra-ink/15 bg-white">
    <table class="w-full border-collapse text-left text-[13px]">
      <caption class="sr-only">
        {{ t('diffCaption') }}
      </caption>
      <thead>
        <tr class="border-b border-vantra-ink/15 text-[11px] uppercase tracking-wide text-vantra-ink/70">
          <th scope="col" class="px-2 py-1 font-semibold">{{ t('diffColProperty') }}</th>
          <th scope="col" class="px-2 py-1 font-semibold">{{ t('diffColCurrent') }}</th>
          <th scope="col" class="px-2 py-1 font-semibold">{{ t('diffColProposed') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.key" class="border-b border-vantra-ink/10 last:border-0">
          <th scope="row" class="px-2 py-1.5 font-mono text-[12px] font-normal">{{ row.key }}</th>
          <td class="px-2 py-1.5 font-mono text-[12px]">
            <span class="inline-flex items-center gap-1.5">
              <span
                v-if="isColor(row.before)"
                class="inline-block size-3 shrink-0 rounded-sm border border-vantra-ink/30"
                :style="{ background: row.before }"
              />
              {{ row.before }}
            </span>
          </td>
          <td class="px-2 py-1.5 font-mono text-[12px] font-semibold">
            <span class="inline-flex items-center gap-1.5">
              <span
                v-if="isColor(row.after)"
                class="inline-block size-3 shrink-0 rounded-sm border border-vantra-ink/30"
                :style="{ background: row.after }"
              />
              {{ row.after }}
            </span>
          </td>
        </tr>
      </tbody>
    </table>

    <p
      v-if="proposal.metrics"
      class="border-t border-vantra-ink/15 px-2 py-1.5 text-[12px]"
    >
      <!-- Text symbols alongside the words, so the pass/fail state survives
           greyscale printing and colour-blindness. -->
      {{ t('metricContrast') }}
      <span class="font-mono">{{ ratio(proposal.metrics.contrastBefore) }}</span>
      <span class="mx-1" aria-hidden="true">→</span>
      <span class="font-mono font-semibold">{{ ratio(proposal.metrics.contrastAfter) }}</span>
      <span class="ml-1">
        ({{ t('metricTarget', [ratio(proposal.metrics.requiredRatio)]) }}
        <span class="font-semibold">
          {{
            proposal.metrics.contrastAfter >= proposal.metrics.requiredRatio
              ? t('metricReached')
              : t('metricNotReached')
          }}
        </span>)
      </span>
    </p>
  </div>
</template>
