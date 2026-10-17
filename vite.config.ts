import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import type { Connect, Plugin } from 'vite'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

/** Pages that belong to the open web only (linked from outside the game). */
const webOnlyFiles = ['privacy.html', 'support.html', 'robots.txt', 'how-to-play.html']

/**
 * The Yandex Games archive: index.html loads the SDK from `/sdk.js` exactly
 * as the platform documents it (requirement 1.19.1); the web-only pages are
 * left out. Locally, `/sdk.js` is answered by `yandex/sdk-mock.js`.
 */
function yandexGames(): Plugin {
  let outDir = ''
  const serveMock: Connect.NextHandleFunction = (_request, response) => {
    response.setHeader('Content-Type', 'text/javascript; charset=utf-8')
    response.end(readFileSync(resolve(import.meta.dirname, 'yandex/sdk-mock.js')))
  }
  return {
    name: 'qybeq-yandex-games',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    // Added after Vite's own HTML processing, so the path stays `/sdk.js`.
    transformIndexHtml: {
      order: 'post',
      handler: () => [{ tag: 'script', attrs: { src: '/sdk.js' }, injectTo: 'head-prepend' }],
    },
    configureServer(server) {
      server.middlewares.use('/sdk.js', serveMock)
    },
    configurePreviewServer(server) {
      server.middlewares.use('/sdk.js', serveMock)
    },
    closeBundle() {
      for (const file of webOnlyFiles) rmSync(resolve(outDir, file), { force: true })
    },
  }
}

/**
 * VK Games build: the same game in a separate output directory. The Pages
 * workflow mounts it at /vk/ and the archive workflow can upload dist-vk
 * without any open-web-only pages or app-ads metadata.
 */
function vkGames(mode: string): Plugin {
  let outDir = ''
  return {
    name: 'qybeq-vk-games',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    closeBundle() {
      for (const file of webOnlyFiles) rmSync(resolve(outDir, file), { force: true })
      rmSync(resolve(outDir, 'app-ads.txt'), { force: true })
      mkdirSync(resolve(outDir, 'licenses'), { recursive: true })
      cpSync(resolve('node_modules/@vkontakte/vk-bridge/LICENSE'), resolve(outDir, 'licenses/VK-Bridge-MIT.txt'))
      writeFileSync(resolve(outDir, 'vk-release.json'), JSON.stringify({
        platform: 'vk',
        appId: loadEnv(mode, process.cwd(), 'VITE_').VITE_VK_APP_ID ?? null,
        ads: true,
        purchases: false,
        languages: ['ru', 'en'],
      }, null, 2))
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const yandex = mode === 'yandex'
  const vk = mode === 'vk'
  return {
    base: './',
    plugins: [react(), ...(yandex ? [yandexGames()] : []), ...(vk ? [vkGames(mode)] : [])],
    build: {
      outDir: yandex ? 'dist-yandex' : vk ? 'dist-vk' : 'dist',
      rollupOptions: {
        // On the web the tutorial is also its own page, linked from Support.
        input: (yandex || vk ? { main: 'index.html' } : { main: 'index.html', howToPlay: 'how-to-play.html' }) as Record<string, string>,
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/tests/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
    },
  }
})
