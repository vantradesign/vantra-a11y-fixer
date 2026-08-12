/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from 'vitest'

import { isRestrictedUrl } from '../src/shared/restricted-url.js'

/**
 * The gate that decides whether a scan is even attempted.
 *
 * Getting this wrong is user-visible in both directions: too strict and a
 * perfectly scannable page is refused, too loose and the user gets an opaque
 * injection failure instead of an explanation.
 */
describe('isRestrictedUrl', () => {
  it.each([
    'chrome://settings',
    'chrome-extension://abcdefghijklmnop/panel.html',
    'edge://flags',
    'about:blank',
    'devtools://devtools/bundled/inspector.html',
    'view-source:https://example.com',
  ])('refuses the browser-internal scheme in %s', (url) => {
    expect(isRestrictedUrl(url)).toBe(true)
  })

  it.each([
    'https://chromewebstore.google.com/detail/foo',
    'https://chrome.google.com/webstore',
    'https://microsoftedge.microsoft.com/addons/detail/bar',
  ])('refuses the extension store at %s', (url) => {
    expect(isRestrictedUrl(url)).toBe(true)
  })

  it('refuses PDFs, which Chrome renders in an extension of its own', () => {
    expect(isRestrictedUrl('https://example.com/report.pdf')).toBe(true)
  })

  it('treats an unparseable URL as restricted rather than guessing', () => {
    expect(isRestrictedUrl('not a url')).toBe(true)
    expect(isRestrictedUrl('')).toBe(true)
  })

  it.each([
    'https://example.com',
    'http://localhost:3000/some/path',
    'https://example.com/pdf-viewer',
    // Only the store's own host is off limits, not every Google property.
    'https://www.google.com/search?q=pdf',
  ])('allows the ordinary page %s', (url) => {
    expect(isRestrictedUrl(url)).toBe(false)
  })
})
