/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import type { BrowserContext } from '@playwright/test'
import { chromium, expect, test } from '@playwright/test'

import { EXTENSION_DIST, extensionBuilt } from './helpers.js'

/**
 * Loads the packaged extension and verifies the promises that are enforced by the
 * browser rather than by our own code: the manifest surface, the CSP, and the
 * absence of any network traffic.
 */

let context: BrowserContext
let extensionId: string

interface Catalog {
  [key: string]: { message: string }
}

/** Reads a locale's catalog straight from the build output. */
async function catalogFor(locale: string): Promise<Catalog> {
  return JSON.parse(
    await readFile(resolve(EXTENSION_DIST, '_locales', locale, 'messages.json'), 'utf8'),
  ) as Catalog
}

const message = (catalog: Catalog, key: string): string => {
  const entry = catalog[key]?.message
  if (entry === undefined) throw new Error(`catalog has no entry for "${key}"`)
  return entry
}

/**
 * Launches the browser with the extension loaded, requesting a UI locale.
 *
 * `--lang` is a request, not a guarantee: Chrome takes its UI language from the
 * system on macOS and ignores the flag. Callers must therefore read back the
 * locale the extension actually got rather than assume this one took effect.
 */
async function launchWithLocale(locale: string): Promise<BrowserContext> {
  return chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [
      `--disable-extensions-except=${EXTENSION_DIST}`,
      `--load-extension=${EXTENSION_DIST}`,
      `--lang=${locale}`,
    ],
  })
}

/** The locale the extension actually resolved to, read from inside the panel. */
async function activeLocale(ctx: BrowserContext, id: string): Promise<string> {
  const page = await ctx.newPage()
  await page.goto(`chrome-extension://${id}/panel.html`)
  const language = await page.evaluate(() => chrome.i18n.getUILanguage())
  await page.close()

  // Only German and English exist; anything else falls back to `default_locale`.
  return language.toLowerCase().startsWith('de') ? 'de' : 'en'
}

/**
 * Catalog for whatever language this browser runs in.
 *
 * The suite asserts against the catalog rather than against fixed prose, so it
 * verifies the panel matches its own locale on any machine.
 */
let ui: Catalog

test.beforeAll(async () => {
  expect(
    extensionBuilt(),
    'Extension build missing — run `pnpm run build` before the e2e suite.',
  ).toBe(true)

  context = await launchWithLocale('de')

  // MV3 registers a service worker; its URL carries the generated extension ID.
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
  extensionId = new URL(worker.url()).host

  ui = await catalogFor(await activeLocale(context, extensionId))
})

test.afterAll(async () => {
  await context?.close()
})

test('registers its service worker without errors', async () => {
  expect(extensionId).toMatch(/^[a-p]{32}$/)
})

test('declares only the permissions it actually needs', async () => {
  const manifest = JSON.parse(
    await readFile(resolve(EXTENSION_DIST, 'manifest.json'), 'utf8'),
  ) as {
    permissions: string[]
    host_permissions?: string[]
    content_security_policy?: { extension_pages?: string }
  }

  expect(manifest.permissions.sort()).toEqual(['activeTab', 'scripting', 'sidePanel', 'storage'])
  // No standing host access: the extension may only touch the tab the user
  // explicitly invokes it on.
  expect(manifest.host_permissions ?? []).toHaveLength(0)
})

test('blocks network access at the CSP level, not by convention', async () => {
  const manifest = JSON.parse(
    await readFile(resolve(EXTENSION_DIST, 'manifest.json'), 'utf8'),
  ) as { content_security_policy?: { extension_pages?: string } }

  const csp = manifest.content_security_policy?.extension_pages ?? ''

  expect(csp).toContain("connect-src 'none'")
  expect(csp).toContain("script-src 'self'")
})

test('the panel loads and shows the privacy values read from the live manifest', async () => {
  const manifest = JSON.parse(
    await readFile(resolve(EXTENSION_DIST, 'manifest.json'), 'utf8'),
  ) as {
    permissions: string[]
    host_permissions?: string[]
    content_security_policy: { extension_pages: string }
  }

  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/panel.html`)

  await expect(page.getByRole('heading', { name: /VANTRA/ })).toBeVisible()
  await page.getByRole('button', { name: message(ui, 'navPrivacy') }).click()

  // Address each value through its own label. Matching on free text would also
  // hit the explanatory prose below it, which is hardcoded copy — exactly what
  // this test needs to distinguish from the real manifest values.
  const valueFor = (labelKey: string) =>
    page.locator(`dl div:has(dt:text-is("${message(ui, labelKey)}")) dd`)

  await expect(valueFor('privacyCspLabel')).toHaveText(
    manifest.content_security_policy.extension_pages,
  )
  await expect(valueFor('privacyPermissionsLabel')).toHaveText(manifest.permissions.join(', '))

  // No host permissions in the manifest must surface as an explicit statement,
  // not as an empty box the user has to interpret.
  expect(manifest.host_permissions ?? []).toEqual([])
  await expect(valueFor('privacyHostPermissionsLabel')).toHaveText(
    message(ui, 'privacyHostPermissionsNone'),
  )

  await page.close()
})

test('makes no network requests while the panel is open', async () => {
  const page = await context.newPage()
  const external: string[] = []

  page.on('request', (request) => {
    const url = request.url()
    // Extension-internal loads and data URIs are not network traffic.
    if (url.startsWith('chrome-extension://') || url.startsWith('data:')) return
    external.push(url)
  })

  await page.goto(`chrome-extension://${extensionId}/panel.html`)
  await page.getByRole('button', { name: message(ui, 'navSettings') }).click()
  await page.getByRole('button', { name: message(ui, 'navPrivacy') }).click()
  await page.waitForTimeout(500)

  expect(external, `unexpected network requests: ${external.join(', ')}`).toHaveLength(0)

  await page.close()
})

test('names a concrete reason instead of failing silently when a scan cannot run', async () => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/panel.html`)

  // Scanning from here cannot succeed: panel.html is opened as an ordinary tab,
  // not as a real side panel beside a real page. Which of the failure reasons
  // applies depends on that setup, so the test asserts the guarantee that holds
  // either way — a named reason from the catalog, never a blank or generic one.
  // Which URLs count as restricted is covered by the unit tests for
  // `isRestrictedUrl`.
  await page.getByRole('button', { name: message(ui, 'btnScan') }).click()

  await expect(page.getByText(message(ui, 'errorTitle'))).toBeVisible()

  const reasons = [
    'errorRestrictedPage',
    'errorNoActiveTab',
    'errorTabNotAccessible',
    'errorInjectionFailed',
    'errorAxeFailed',
  ].map((key) => message(ui, key))

  const body = await page.locator('main').innerText()
  expect(
    reasons.some((reason) => body.includes(reason)),
    `panel showed no known reason. Body was:\n${body}`,
  ).toBe(true)

  await page.close()
})

for (const requested of ['de', 'en']) {
  test(`renders the panel from the catalog when launched with --lang=${requested}`, async () => {
    const ctx = await launchWithLocale(requested)

    try {
      const worker = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'))
      const id = new URL(worker.url()).host

      // Read back what the extension resolved to. Where `--lang` is honoured this
      // covers both languages; where it is not, it still proves the panel agrees
      // with its own locale.
      const locale = await activeLocale(ctx, id)
      const catalog = await catalogFor(locale)
      const other = await catalogFor(locale === 'de' ? 'en' : 'de')

      const page = await ctx.newPage()
      await page.goto(`chrome-extension://${id}/panel.html`)

      await expect(page.getByRole('button', { name: message(catalog, 'btnScan') })).toBeVisible()
      await expect(page.getByText(message(catalog, 'emptyIdleTitle'))).toBeVisible()

      // The other language must be absent, not merely accompanied.
      await expect(page.getByText(message(other, 'emptyIdleTitle'))).toHaveCount(0)

      // An unresolved key renders as the key itself; catching that here is
      // cheaper than spotting it in a screenshot.
      const body = (await page.locator('body').innerText()).toLowerCase()
      for (const key of ['btnscan', 'emptyidletitle', 'navsettings']) {
        expect(body, `unresolved catalog key "${key}" leaked into the UI`).not.toContain(key)
      }
    } finally {
      await ctx.close()
    }
  })
}

test('the panel is keyboard navigable with a visible focus indicator', async () => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/panel.html`)

  await page.keyboard.press('Tab')

  const focused = await page.evaluate(() => {
    const active = document.activeElement
    if (!active) return null
    const style = getComputedStyle(active)
    return {
      tag: active.tagName.toLowerCase(),
      outlineWidth: style.outlineWidth,
      outlineStyle: style.outlineStyle,
    }
  })

  expect(focused?.tag).toBe('button')
  // SC 2.4.13: the focus indicator must be actually rendered, not outline: none.
  expect(focused?.outlineStyle).not.toBe('none')
  expect(Number.parseFloat(focused?.outlineWidth ?? '0')).toBeGreaterThanOrEqual(2)

  await page.close()
})
