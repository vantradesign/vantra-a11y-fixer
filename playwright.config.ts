import { defineConfig, devices } from '@playwright/test'

// Deliberately not 4173/5173/3000: those collide with Vite and Nuxt preview
// servers a developer is likely to have running while working on vantra-site.
const PORT = Number(process.env['E2E_PORT'] ?? 4319)

export default defineConfig({
  testDir: 'tests/e2e',
  // The extension specs launch their own persistent context and must not share a
  // profile directory, so they run one at a time.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env['CI']),
  retries: 0,
  reporter: process.env['CI'] ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'node tests/e2e/static-server.mjs',
    url: `http://localhost:${PORT}/tests/e2e/fixtures/violations.html`,
    reuseExistingServer: !process.env['CI'],
    stdout: 'ignore',
  },
})
