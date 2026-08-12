<!--
  This Source Code Form is subject to the terms of the Mozilla Public
  License, v. 2.0. If a copy of the MPL was not distributed with this
  file, You can obtain one at https://mozilla.org/MPL/2.0/.
-->
<script setup lang="ts">
import { ref } from 'vue'
import type { FixProposal, IssueCluster } from '@vantra-a11y/protocol'

import DiffView from './DiffView.vue'
import {
  CATEGORY_KEY,
  CONFIDENCE_HINT_KEY,
  CONFIDENCE_KEY,
  SEVERITY_KEY,
  t,
  tt,
} from '../../shared/i18n.js'
import { CATEGORY_GLYPH } from '../labels.js'

const props = defineProps<{ cluster: IssueCluster; appliedProposalIds: string[] }>()
const emit = defineEmits<{
  back: []
  show: [selector: string]
  toggle: [proposal: FixProposal]
}>()

const copied = ref<string | null>(null)

async function copy(proposal: FixProposal): Promise<void> {
  const text = [proposal.snippet.css, proposal.snippet.html].filter(Boolean).join('\n\n')
  await navigator.clipboard.writeText(text)
  copied.value = proposal.id
  window.setTimeout(() => {
    if (copied.value === proposal.id) copied.value = null
  }, 2000)
}

const isApplied = (proposal: FixProposal): boolean => props.appliedProposalIds.includes(proposal.id)
</script>

<template>
  <div class="flex flex-col">
    <div class="sticky top-0 border-b border-vantra-ink/15 bg-vantra-paper px-3 py-2">
      <button
        type="button"
        class="inline-flex min-h-6 items-center gap-1 text-[13px] font-medium text-vantra-blue underline"
        @click="emit('back')"
      >
        <span aria-hidden="true">←</span> {{ t('backToOverview') }}
      </button>
    </div>

    <div class="px-3 py-3">
      <p class="flex flex-wrap items-center gap-x-2 text-[11px] font-semibold uppercase tracking-wide text-vantra-ink/70">
        <span>{{ t(SEVERITY_KEY[cluster.severity]) }}</span>
        <span aria-hidden="true">·</span>
        <span>
          <span aria-hidden="true">{{ CATEGORY_GLYPH[cluster.category] }}</span>
          {{ t(CATEGORY_KEY[cluster.category]) }}
        </span>
        <span aria-hidden="true">·</span>
        <span class="font-mono">SC {{ cluster.wcag.sc }} {{ cluster.wcag.level }}</span>
      </p>

      <h2 class="mt-1 text-[16px] font-semibold leading-snug">{{ tt(cluster.title) }}</h2>
      <p class="mt-1.5 text-[13px] leading-relaxed">{{ tt(cluster.explanation) }}</p>
      <p class="mt-1 text-[12px] text-vantra-ink/70">
        {{ tt(cluster.wcag.title) }} · {{ t('labelAxeRule') }}
        <code class="font-mono">{{ cluster.ruleId }}</code>
      </p>
    </div>

    <section class="border-t border-vantra-ink/15 px-3 py-3" aria-labelledby="occurrences-heading">
      <h3 id="occurrences-heading" class="text-[13px] font-semibold">
        {{ t('headingOccurrences', [String(cluster.occurrences.length)]) }}
      </h3>
      <ul class="mt-2 space-y-1.5">
        <li
          v-for="occurrence in cluster.occurrences"
          :key="occurrence.selector"
          class="flex items-start justify-between gap-2 rounded border border-vantra-ink/15 bg-white px-2 py-1.5"
        >
          <code class="break-all font-mono text-[12px]">{{ occurrence.selector }}</code>
          <button
            type="button"
            class="min-h-6 shrink-0 rounded border border-vantra-blue px-2 py-0.5 text-[12px] font-medium text-vantra-blue hover:bg-vantra-mist"
            @click="emit('show', occurrence.selector)"
          >
            {{ t('btnShowInPage') }}
          </button>
        </li>
      </ul>
    </section>

    <section
      v-if="cluster.proposals.length > 0"
      class="border-t border-vantra-ink/15 px-3 py-3"
      aria-labelledby="proposals-heading"
    >
      <h3 id="proposals-heading" class="text-[13px] font-semibold">{{ t('headingProposals') }}</h3>

      <article
        v-for="proposal in cluster.proposals"
        :key="proposal.id"
        class="mt-3 rounded border border-vantra-ink/20 bg-vantra-paper p-2"
      >
        <header class="flex flex-wrap items-baseline justify-between gap-2">
          <h4 class="font-mono text-[13px] font-semibold">{{ tt(proposal.label) }}</h4>
          <span
            class="rounded-full border border-vantra-ink/30 px-2 py-0.5 text-[11px]"
            :title="t(CONFIDENCE_HINT_KEY[proposal.confidence])"
          >
            {{ t(CONFIDENCE_KEY[proposal.confidence]) }}
          </span>
        </header>

        <p class="mt-1.5 text-[12px] leading-relaxed text-vantra-ink/85">
          {{ tt(proposal.rationale) }}
        </p>

        <div class="mt-2">
          <DiffView :proposal="proposal" />
        </div>

        <div class="mt-2 flex flex-wrap gap-2">
          <!-- "Vorschau anwenden", never "reparieren": the change is temporary
               and reversible, and the wording must not imply otherwise. -->
          <button
            v-if="proposal.kind !== 'markup'"
            type="button"
            class="min-h-8 rounded px-2.5 py-1 text-[13px] font-medium"
            :class="
              isApplied(proposal)
                ? 'bg-vantra-ink text-vantra-paper'
                : 'border border-vantra-blue text-vantra-blue hover:bg-vantra-mist'
            "
            :aria-pressed="isApplied(proposal)"
            @click="emit('toggle', proposal)"
          >
            {{ isApplied(proposal) ? t('btnPreviewActive') : t('btnPreviewApply') }}
          </button>

          <button
            type="button"
            class="min-h-8 rounded bg-vantra-blue px-2.5 py-1 text-[13px] font-medium text-white hover:bg-vantra-ink"
            @click="copy(proposal)"
          >
            {{ copied === proposal.id ? t('btnCopied') : t('btnCopyCode') }}
          </button>
        </div>

        <p v-if="proposal.editable" class="mt-2 text-[12px] italic text-vantra-ink/70">
          {{ t('editableHint') }}
        </p>
      </article>
    </section>

    <section
      v-if="cluster.manualGuidance"
      class="border-t border-vantra-ink/15 px-3 py-3"
      aria-labelledby="manual-heading"
    >
      <h3 id="manual-heading" class="text-[13px] font-semibold">{{ t('headingManual') }}</h3>
      <p class="mt-1.5 text-[13px] leading-relaxed">{{ tt(cluster.manualGuidance) }}</p>
    </section>
  </div>
</template>
