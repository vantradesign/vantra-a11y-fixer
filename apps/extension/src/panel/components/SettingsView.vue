<!--
  This Source Code Form is subject to the terms of the Mozilla Public
  License, v. 2.0. If a copy of the MPL was not distributed with this
  file, You can obtain one at https://mozilla.org/MPL/2.0/.
-->
<script setup lang="ts">
import type { Category, Settings, WcagLevel } from '@vantra-a11y/protocol'

import { CATEGORY_KEY, t } from '../../shared/i18n.js'
import type { MessageKey } from '../../shared/i18n.js'

const props = defineProps<{ settings: Settings }>()
const emit = defineEmits<{ update: [settings: Settings] }>()

const LEVELS: WcagLevel[] = ['A', 'AA', 'AAA']
const CATEGORIES: Category[] = ['contrast', 'semantics', 'structure', 'interaction', 'manual']

function patch(partial: Partial<Settings>): void {
  emit('update', { ...props.settings, ...partial })
}

function toggleCategory(category: Category, enabled: boolean): void {
  const next = enabled
    ? [...props.settings.enabledCategories, category]
    : props.settings.enabledCategories.filter((entry) => entry !== category)
  patch({ enabledCategories: next })
}
</script>

<template>
  <div class="space-y-5 px-3 py-3">
    <fieldset>
      <legend class="text-[13px] font-semibold">{{ t('settingsLevelLegend') }}</legend>
      <p class="mt-1 text-[12px] text-vantra-ink/70">{{ t('settingsLevelHint') }}</p>
      <div class="mt-2 flex gap-2">
        <label
          v-for="level in LEVELS"
          :key="level"
          class="flex min-h-8 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded border px-2 py-1 text-[13px]"
          :class="
            settings.targetLevel === level
              ? 'border-vantra-blue bg-vantra-blue text-white'
              : 'border-vantra-ink/30'
          "
        >
          <input
            type="radio"
            name="target-level"
            class="sr-only"
            :value="level"
            :checked="settings.targetLevel === level"
            @change="patch({ targetLevel: level })"
          />
          {{ level }}
        </label>
      </div>
    </fieldset>

    <fieldset>
      <legend class="text-[13px] font-semibold">{{ t('settingsCategoriesLegend') }}</legend>
      <div class="mt-2 space-y-1.5">
        <label
          v-for="category in CATEGORIES"
          :key="category"
          class="flex min-h-7 items-center gap-2 text-[13px]"
        >
          <input
            type="checkbox"
            class="size-4"
            :checked="settings.enabledCategories.includes(category)"
            @change="toggleCategory(category, ($event.target as HTMLInputElement).checked)"
          />
          {{ t(CATEGORY_KEY[category]) }}
        </label>
      </div>
    </fieldset>

    <fieldset>
      <legend class="text-[13px] font-semibold">{{ t('settingsMeasureLegend') }}</legend>
      <label class="mt-2 flex min-h-7 items-start gap-2 text-[13px]">
        <input
          type="checkbox"
          class="mt-0.5 size-4 shrink-0"
          :checked="settings.measurePixelContrast"
          @change="patch({ measurePixelContrast: ($event.target as HTMLInputElement).checked })"
        />
        {{ t('settingsMeasurePixelContrast') }}
      </label>
      <p class="mt-1 text-[12px] leading-relaxed text-vantra-ink/70">
        {{ t('settingsMeasurePixelContrastHint') }}
      </p>
    </fieldset>

    <fieldset>
      <legend class="text-[13px] font-semibold">{{ t('settingsOverlayLegend') }}</legend>
      <label class="mt-2 flex min-h-7 items-center gap-2 text-[13px]">
        <input
          type="checkbox"
          class="size-4"
          :checked="settings.overlay.enabled"
          @change="
            patch({
              overlay: {
                ...settings.overlay,
                enabled: ($event.target as HTMLInputElement).checked,
              },
            })
          "
        />
        {{ t('settingsOverlayShowMarkers') }}
      </label>
      <label class="mt-1.5 flex min-h-7 items-center gap-2 text-[13px]">
        <input
          type="checkbox"
          class="size-4"
          :checked="settings.overlay.highContrastMarkers"
          @change="
            patch({
              overlay: {
                ...settings.overlay,
                highContrastMarkers: ($event.target as HTMLInputElement).checked,
              },
            })
          "
        />
        {{ t('settingsOverlayHighContrast') }}
      </label>
    </fieldset>

    <fieldset>
      <legend class="text-[13px] font-semibold">{{ t('settingsFixLegend') }}</legend>
      <label class="mt-2 flex min-h-7 items-center gap-2 text-[13px]">
        <input
          type="checkbox"
          class="size-4"
          :checked="settings.fixPreferences.preferAdjusting === 'background'"
          @change="
            patch({
              fixPreferences: {
                ...settings.fixPreferences,
                preferAdjusting: ($event.target as HTMLInputElement).checked
                  ? 'background'
                  : 'foreground',
              },
            })
          "
        />
        {{ t('settingsPreferBackground') }}
      </label>
      <label class="mt-1.5 flex min-h-7 items-center gap-2 text-[13px]">
        <input
          type="checkbox"
          class="size-4"
          :checked="settings.fixPreferences.snapToPalette"
          @change="
            patch({
              fixPreferences: {
                ...settings.fixPreferences,
                snapToPalette: ($event.target as HTMLInputElement).checked,
              },
            })
          "
        />
        {{ t('settingsSnapPalette') }}
      </label>
      <label class="mt-1.5 block text-[13px]">
        <span class="block">{{ t('settingsPaletteLabel') }}</span>
        <input
          type="text"
          class="mt-1 w-full rounded border border-vantra-ink/30 px-2 py-1 font-mono text-[12px]"
          :value="settings.fixPreferences.palette.join(', ')"
          placeholder="#021f94, #001619"
          @change="
            patch({
              fixPreferences: {
                ...settings.fixPreferences,
                palette: ($event.target as HTMLInputElement).value
                  .split(',')
                  .map((entry) => entry.trim())
                  .filter((entry) => entry.length > 0),
              },
            })
          "
        />
      </label>
    </fieldset>

    <fieldset>
      <legend class="text-[13px] font-semibold">{{ t('settingsEmpathyLegend' as MessageKey) }}</legend>
      <p class="mt-1 text-[12px] text-vantra-ink/70">{{ t('settingsEmpathyHint' as MessageKey) }}</p>

      <label class="mt-2 block text-[13px]">
        <span class="block">{{ t('settingsEmpathyRate' as MessageKey) }}</span>
        <div class="mt-1 flex items-center gap-2">
          <input
            type="range"
            min="0.5"
            max="2"
            step="0.1"
            class="flex-1"
            :value="settings.empathy.speechRate"
            @input="
              patch({
                empathy: {
                  ...settings.empathy,
                  speechRate: parseFloat(($event.target as HTMLInputElement).value),
                },
              })
            "
          />
          <span class="w-8 text-right font-mono text-[12px]">{{ settings.empathy.speechRate.toFixed(1) }}</span>
        </div>
      </label>

      <label class="mt-2 block text-[13px]">
        <span class="block">{{ t('settingsEmpathyPitch' as MessageKey) }}</span>
        <div class="mt-1 flex items-center gap-2">
          <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            class="flex-1"
            :value="settings.empathy.speechPitch"
            @input="
              patch({
                empathy: {
                  ...settings.empathy,
                  speechPitch: parseFloat(($event.target as HTMLInputElement).value),
                },
              })
            "
          />
          <span class="w-8 text-right font-mono text-[12px]">{{ settings.empathy.speechPitch.toFixed(1) }}</span>
        </div>
      </label>
    </fieldset>

    <section aria-labelledby="model-heading">
      <h3 id="model-heading" class="text-[13px] font-semibold">{{ t('settingsModelHeading') }}</h3>
      <p class="mt-1 text-[12px] text-vantra-ink/70">{{ t('settingsModelBody') }}</p>
    </section>
  </div>
</template>
