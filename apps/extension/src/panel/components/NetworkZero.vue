<!--
  This Source Code Form is subject to the terms of the Mozilla Public
  License, v. 2.0. If a copy of the MPL was not distributed with this
  file, You can obtain one at https://mozilla.org/MPL/2.0/.
-->
<script setup lang="ts">
import { computed } from 'vue'

import { t, tParts } from '../../shared/i18n.js'

const CSP_DIRECTIVE = "connect-src 'none'"
const EXTENSIONS_URL = 'chrome://extensions'

// Split around the placeholder so the code fragment can be styled without
// putting markup in the catalog — and without assuming a word order.
const cspNote = tParts('privacyCspNote')
const verifyStep1 = tParts('privacyVerifyStep1')

/**
 * Reads the privacy-relevant manifest fields at runtime, straight from
 * `chrome.runtime.getManifest()`. The point is that this section is not a
 * marketing claim we typed in — it reflects what the browser actually enforces.
 */
const manifest = chrome.runtime.getManifest()

const csp = computed(() => {
  const policy = manifest.content_security_policy
  if (typeof policy === 'string') return policy
  return policy?.extension_pages ?? '—'
})

const permissions = computed(() => (manifest.permissions ?? []).join(', ') || '—')
const hostPermissions = computed(() => (manifest.host_permissions ?? []).join(', '))
</script>

<template>
  <div class="space-y-3 px-3 py-3 text-[13px] leading-relaxed">
    <p class="font-medium">{{ t('privacyLead') }}</p>

    <p class="text-vantra-ink/80">{{ t('privacyTrust') }}</p>

    <!-- Stated on the privacy page itself, not only in settings. A tool that
         photographs the page has to say so where people come to check what it
         does, or the rest of this page is worth nothing. -->
    <p class="text-vantra-ink/80">{{ t('privacyCaptures') }}</p>

    <dl class="space-y-2">
      <div>
        <dt class="text-[11px] font-semibold uppercase tracking-wide text-vantra-ink/70">
          {{ t('privacyCspLabel') }}
        </dt>
        <dd class="mt-0.5 break-all rounded border border-vantra-ink/20 bg-white px-2 py-1 font-mono text-[12px]">
          {{ csp }}
        </dd>
        <p class="mt-1 text-[12px] text-vantra-ink/70">
          {{ cspNote[0] }}<code class="font-mono">{{ CSP_DIRECTIVE }}</code>{{ cspNote[1] }}
        </p>
      </div>

      <div>
        <dt class="text-[11px] font-semibold uppercase tracking-wide text-vantra-ink/70">
          {{ t('privacyPermissionsLabel') }}
        </dt>
        <dd class="mt-0.5 rounded border border-vantra-ink/20 bg-white px-2 py-1 font-mono text-[12px]">
          {{ permissions }}
        </dd>
      </div>

      <div>
        <dt class="text-[11px] font-semibold uppercase tracking-wide text-vantra-ink/70">
          {{ t('privacyHostPermissionsLabel') }}
        </dt>
        <dd class="mt-0.5 rounded border border-vantra-ink/20 bg-white px-2 py-1 font-mono text-[12px]">
          {{ hostPermissions || t('privacyHostPermissionsNone') }}
        </dd>
      </div>
    </dl>

    <section aria-labelledby="verify-heading">
      <h3 id="verify-heading" class="text-[13px] font-semibold">
        {{ t('privacyVerifyHeading') }}
      </h3>
      <ol class="mt-1 list-decimal space-y-1 pl-5 text-[12px]">
        <li>
          {{ verifyStep1[0]
          }}<code class="font-mono">{{ EXTENSIONS_URL }}</code
          >{{ verifyStep1[1] }}
        </li>
        <li>{{ t('privacyVerifyStep2') }}</li>
        <li>{{ t('privacyVerifyStep3') }}</li>
      </ol>
    </section>

    <p class="text-[12px] text-vantra-ink/70">{{ t('privacyFooter') }}</p>
  </div>
</template>
