/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'
import type { Settings } from '@vantra-a11y/protocol'

/**
 * Explicit settings for the specs, passed into `page.evaluate` as an argument.
 * Spelled out rather than imported into the page context, because the browser
 * side of these tests only has the harness bundle available.
 */
export const E2E_SETTINGS: Settings = {
  targetLevel: 'AA',
  enabledCategories: ['contrast', 'semantics', 'structure', 'interaction', 'manual'],
  overlay: { enabled: true, outlineWidthPx: 2, highContrastMarkers: false },
  // Off by default here: it needs a capture function the harness cannot provide
  // on its own. The specs that exercise it turn it on and supply one.
  measurePixelContrast: false,
  fixPreferences: { preferAdjusting: 'foreground', snapToPalette: false, palette: [] },
}

export const REPO_ROOT = resolve(import.meta.dirname, '../..')
export const EXTENSION_DIST = resolve(REPO_ROOT, 'apps/extension/dist')
export const HARNESS_FILE = resolve(REPO_ROOT, 'apps/extension/dist-harness/harness.js')

export const FIXTURE_PATH = '/tests/e2e/fixtures/violations.html'
const HARNESS_URL = '/apps/extension/dist-harness/harness.js'

export const harnessBuilt = (): boolean => existsSync(HARNESS_FILE)
export const extensionBuilt = (): boolean => existsSync(resolve(EXTENSION_DIST, 'manifest.json'))

/**
 * Loads the fixture page and injects the content-script harness.
 *
 * Fails loudly rather than silently skipping if the harness is missing: a green
 * run that quietly tested nothing is worse than a red one.
 */
export async function openFixture(page: Page, path = FIXTURE_PATH): Promise<void> {
  expect(
    harnessBuilt(),
    'Harness bundle missing — run `pnpm run build:harness` before the e2e suite.',
  ).toBe(true)

  await page.goto(path)
  await page.addScriptTag({ url: HARNESS_URL })
  await page.waitForFunction(() => window.__vantraHarness !== undefined)
}

/**
 * A catalog reference as it crosses back into Node.
 *
 * The analysis layer emits keys, not prose, so the e2e assertions match on keys
 * too — which also means they no longer break when a translation is reworded.
 */
export interface TextRef {
  key: string
  args?: string[]
}

/** Shape of the analysis result as it crosses back into Node. */
export interface ScanSummary {
  clusters: Array<{
    id: string
    ruleId: string
    category: string
    severity: string
    title: TextRef
    manualGuidance?: TextRef
    selectors: string[]
    proposals: Array<{
      id: string
      kind: string
      confidence: string
      label: TextRef
      after: Record<string, string>
      css?: string
      html?: string
      metrics?: { contrastBefore: number; contrastAfter: number; requiredRatio: number }
    }>
  }>
  needsManualReview: number
  elementCount: number
  axeVersion: string
}

export async function runScan(
  page: Page,
  settings: Record<string, unknown> = {},
): Promise<ScanSummary> {
  return page.evaluate(async (overrides) => {
    const result = await window.__vantraHarness.scan(overrides)
    return {
      clusters: result.clusters.map((cluster) => ({
        id: cluster.id,
        ruleId: cluster.ruleId,
        category: cluster.category,
        severity: cluster.severity,
        title: cluster.title,
        manualGuidance: cluster.manualGuidance,
        selectors: cluster.occurrences.map((occurrence) => occurrence.selector),
        proposals: cluster.proposals.map((proposal) => ({
          id: proposal.id,
          kind: proposal.kind,
          confidence: proposal.confidence,
          label: proposal.label,
          after: proposal.after,
          css: proposal.snippet.css,
          html: proposal.snippet.html,
          metrics: proposal.metrics,
        })),
      })),
      needsManualReview: result.needsManualReview,
      elementCount: result.elementCount,
      axeVersion: result.axeVersion,
    }
  }, settings)
}

export const clusterFor = (summary: ScanSummary, ruleId: string) =>
  summary.clusters.filter((cluster) => cluster.ruleId === ruleId)
