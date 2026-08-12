/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vite'

/**
 * Builds the Playwright test harness (see `tests/harness/entry.ts`).
 *
 * Separate from the shipping builds and written to its own directory, so a test
 * artefact can never end up inside `dist/` and be packaged into the extension.
 */
export default defineConfig({
  build: {
    outDir: 'dist-harness',
    emptyOutDir: true,
    target: 'chrome116',
    lib: {
      entry: fileURLToPath(new URL('./tests/harness/entry.ts', import.meta.url)),
      formats: ['iife'],
      name: 'VantraHarness',
      fileName: () => 'harness.js',
    },
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
})
