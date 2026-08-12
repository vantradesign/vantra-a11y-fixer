/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

/**
 * Builds the extension-page bundle: the Vue side panel and the service worker.
 *
 * The content script is built separately (`vite.content.config.ts`) because MV3
 * content scripts cannot be ES modules — it needs an IIFE bundle.
 */
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome116',
    rollupOptions: {
      input: {
        panel: fileURLToPath(new URL('./panel.html', import.meta.url)),
        background: fileURLToPath(new URL('./src/background/index.ts', import.meta.url)),
      },
      output: {
        // The manifest references these by fixed name.
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
})
