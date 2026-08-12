/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { analyse } from '@vantra-a11y/fix-engine'
import type { IssueCluster, PageMessage, PanelMessage, Settings } from '@vantra-a11y/protocol'

import { PreviewApplier } from './applier.js'
import { runAxe } from './axe-runner.js'
import { measureContrast } from './measure-contrast.js'
import { Overlay } from './overlay.js'

const overlay = new Overlay()
const applier = new PreviewApplier()

let lastClusters: IssueCluster[] = []
let lastSettings: Settings | null = null
let scanning = false

const send = (message: PageMessage): void => {
  // The service worker may be asleep; a failed send is not an error worth
  // surfacing to the user.
  void chrome.runtime.sendMessage(message).catch(() => undefined)
}

/**
 * Asks the panel to photograph the viewport.
 *
 * Content scripts cannot call `chrome.tabs.captureVisibleTab`; only extension
 * pages may. A missing reply is normal rather than exceptional — the panel may be
 * closed — and means the measurement is skipped, not that the scan failed.
 */
async function captureViewport(): Promise<string | null> {
  try {
    const reply: unknown = await chrome.runtime.sendMessage({ type: 'CAPTURE_VIEWPORT' })
    return typeof reply === 'string' ? reply : null
  } catch {
    return null
  }
}

const proposalFor = (clusterId: string, proposalId: string) =>
  lastClusters
    .find((cluster) => cluster.id === clusterId)
    ?.proposals.find((proposal) => proposal.id === proposalId)

async function scan(settings: Settings): Promise<void> {
  if (scanning) return
  scanning = true
  lastSettings = settings

  try {
    send({ type: 'SCAN_PROGRESS', phase: 'analysing', percent: 20 })
    const scanned = await runAxe(settings)

    // Where axe could not see the background, measure it. Skipped when switched
    // off, since it costs a screenshot pair per viewport.
    const measured = settings.measurePixelContrast
      ? await measureContrast(scanned.issues, settings, {
          capture: captureViewport,
          onProgress: (done, total) => {
            send({
              type: 'SCAN_PROGRESS',
              phase: 'measuring',
              percent: 20 + Math.round((done / total) * 45),
            })
          },
        })
      : { issues: scanned.issues, cleared: 0 }

    send({ type: 'SCAN_PROGRESS', phase: 'proposing', percent: 70 })
    const result = analyse({
      url: location.href,
      scannedAt: Date.now(),
      axeVersion: scanned.axeVersion,
      elementCount: scanned.elementCount,
      issues: measured.issues,
      settings,
      // The audited page's language, not the browser UI locale: proposed
      // accessible names are written into this page.
      pageLang: document.documentElement.lang,
    })

    lastClusters = result.clusters
    overlay.render(result.clusters, settings)
    send({
      type: 'SCAN_RESULT',
      result: measured.cleared > 0 ? { ...result, pixelCleared: measured.cleared } : result,
    })
  } catch (error) {
    send({
      type: 'SCAN_ERROR',
      reason: 'axe-failed',
      detail: error instanceof Error ? error.message : String(error),
    })
  } finally {
    scanning = false
  }
}

chrome.runtime.onMessage.addListener((message: PanelMessage, _sender, respond) => {
  switch (message.type) {
    case 'SCAN_START':
      void scan(message.settings)
      respond({ ok: true })
      return false

    case 'HIGHLIGHT':
      overlay.highlight(message.selector)
      respond({ ok: true })
      return false

    case 'APPLY_PREVIEW': {
      const proposal = proposalFor(message.clusterId, message.proposalId)
      const ok = proposal ? applier.apply(proposal, message.selector) : false
      send({ type: 'PREVIEW_STATE', appliedProposalIds: applier.appliedIds() })
      respond({ ok })
      return false
    }

    case 'REVERT_PREVIEW':
      applier.revert(message.proposalId, message.selector)
      send({ type: 'PREVIEW_STATE', appliedProposalIds: applier.appliedIds() })
      respond({ ok: true })
      return false

    case 'REVERT_ALL':
      applier.revertAll()
      send({ type: 'PREVIEW_STATE', appliedProposalIds: [] })
      respond({ ok: true })
      return false

    case 'SETTINGS_CHANGED':
      lastSettings = message.settings
      overlay.render(lastClusters, message.settings)
      respond({ ok: true })
      return false

    default:
      respond({ ok: false })
      return false
  }
})

/**
 * A single-page app can navigate without reloading the content script, which
 * would leave the panel showing findings for a page that no longer exists. We
 * drop everything and tell the panel to invalidate.
 */
let lastUrl = location.href
window.setInterval(() => {
  if (location.href === lastUrl) return
  lastUrl = location.href
  applier.revertAll()
  overlay.clear()
  lastClusters = []
  send({ type: 'PAGE_NAVIGATED', url: lastUrl })
}, 700)

window.addEventListener('pagehide', () => {
  applier.revertAll()
  overlay.destroy()
})

// Restore the overlay if the panel already had settings when we were injected.
if (lastSettings) overlay.mount(lastSettings)
