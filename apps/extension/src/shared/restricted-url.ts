/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const RESTRICTED_SCHEMES = [
  'chrome:',
  'chrome-extension:',
  'edge:',
  'about:',
  'devtools:',
  'view-source:',
]

const RESTRICTED_HOSTS = [
  'chromewebstore.google.com',
  'chrome.google.com',
  'microsoftedge.microsoft.com',
]

/**
 * Pages the browser refuses to let extensions script. Checked before a scan so
 * the panel can show a clear explanation instead of a generic failure.
 *
 * Lives in the extension rather than in `@vantra-a11y/protocol`: it needs the
 * platform `URL` global, and pulling the DOM lib into the protocol package would
 * also pull it into the fix engine, which must stay DOM-free by construction.
 */
export function isRestrictedUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (RESTRICTED_SCHEMES.includes(parsed.protocol)) return true
    if (RESTRICTED_HOSTS.includes(parsed.hostname)) return true
    // Chrome's built-in PDF viewer is an extension itself and cannot be scripted.
    return parsed.pathname.endsWith('.pdf')
  } catch {
    // An unparseable URL is not something we can safely inject into.
    return true
  }
}
