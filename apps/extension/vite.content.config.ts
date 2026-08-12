/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { fileURLToPath } from 'node:url'

import type { Plugin } from 'vite'
import { defineConfig } from 'vite'

/**
 * axe-core's own banner requires that its copyright notice appears in every file
 * containing substantial portions of its source. Minification strips the original
 * comment, so we re-emit it here — see LICENSE-THIRD-PARTY.md. Do not remove.
 */
const AXE_NOTICE = `/*! Bundled dependency: axe-core — Copyright (c) 2015 - 2026 Deque Systems, Inc.
 *
 * Your use of this Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * This entire copyright notice must appear in every copy of this file you
 * distribute or in any file that contains substantial portions of this source
 * code.
 */\n`

/**
 * Prepends the notice in `generateBundle`, which runs *after* Vite's esbuild
 * minify pass. `output.banner` is not sufficient: minification discards it.
 */
function preserveAxeNotice(): Plugin {
  return {
    name: 'vantra:preserve-axe-notice',
    generateBundle(_options, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type === 'chunk') {
          chunk.code = AXE_NOTICE + chunk.code
        }
      }
    },
  }
}

/**
 * Content-script bundle.
 *
 * MV3 content scripts are not ES modules, so this must be a single self-contained
 * IIFE with no imports at runtime — including axe-core, which is bundled rather
 * than fetched (see docs/ARCHITECTURE.md §6: no network access, ever).
 *
 * `emptyOutDir: false` because the panel build runs first and owns the directory.
 */
export default defineConfig({
  plugins: [preserveAxeNotice()],
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'chrome116',
    lib: {
      entry: fileURLToPath(new URL('./src/content/index.ts', import.meta.url)),
      formats: ['iife'],
      name: 'VantraA11y',
      fileName: () => 'content.js',
    },
    rollupOptions: {
      output: {
        extend: true,
        inlineDynamicImports: true,
      },
    },
  },
})
