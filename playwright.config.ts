import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  webServer: [
    { command: 'npm run dev -- --host 127.0.0.1', url: 'http://127.0.0.1:5173', reuseExistingServer: true },
    // The Yandex Games build with the local SDK stand-in (e2e/yandex.spec.ts).
    { command: 'npm run dev:yandex -- --host 127.0.0.1 --port 5175 --strictPort', url: 'http://127.0.0.1:5175', reuseExistingServer: true },
  ],
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 5'] } },
  ],
})
