/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'

/**
 * Minimal static file server for the e2e fixtures.
 *
 * Hand-rolled rather than pulling in a dependency: the extension must be
 * verifiable offline, and a test server with its own dependency tree would
 * undercut that claim for no benefit.
 */

const ROOT = resolve(import.meta.dirname, '../..')
// Keep in sync with playwright.config.ts.
const PORT = Number(process.env['E2E_PORT'] ?? 4319)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://localhost:${PORT}`)
  // `normalize` collapses `..` segments before the prefix check, so a crafted
  // path cannot escape the repo root.
  const filePath = join(ROOT, normalize(url.pathname))

  if (!filePath.startsWith(ROOT)) {
    response.writeHead(403).end('Forbidden')
    return
  }

  try {
    const info = await stat(filePath)
    if (info.isDirectory()) {
      response.writeHead(404).end('Not found')
      return
    }

    response.writeHead(200, {
      'content-type': MIME[extname(filePath)] ?? 'application/octet-stream',
      // Fresh bytes every run, so a rebuilt harness is never served from cache.
      'cache-control': 'no-store',
    })
    createReadStream(filePath).pipe(response)
  } catch {
    response.writeHead(404).end('Not found')
  }
})

server.listen(PORT, () => {
  process.stdout.write(`e2e static server on http://localhost:${PORT}\n`)
})
