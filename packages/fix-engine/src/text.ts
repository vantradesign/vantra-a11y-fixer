/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { LocalizedText } from '@vantra-a11y/protocol'

/**
 * Builds a catalog reference. The engine never produces prose — see the note on
 * `LocalizedText` in the protocol package for why resolution happens in the UI.
 */
export const text = (key: string, ...args: string[]): LocalizedText =>
  args.length > 0 ? { key, args } : { key }
