import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json' with { type: 'json' }

// GitHub Pages serves the app under the repository name (case matters).
const BASE = '/Travel-Sidekick/'

export default defineConfig({
  base: BASE,
  define: { __VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'inline',
      includeAssets: ['dm-serif-display.ttf', 'apple-touch-icon.png', 'favicon.png'],
      manifest: {
        name: 'Travel Sidekick',
        short_name: 'Sidekick',
        description: 'Family trip sidekick: never miss a must-see.',
        lang: 'en',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        background_color: '#F7F3EA',
        theme_color: '#F7F3EA',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ttf}'],
        navigateFallback: BASE + 'index.html',
        runtimeCaching: [{
          urlPattern: ({ url }) => url.hostname.endsWith('wikimedia.org'),
          handler: 'CacheFirst',
          options: { cacheName: 'photos', expiration: { maxEntries: 150, maxAgeSeconds: 90 * 24 * 3600 }, cacheableResponse: { statuses: [0, 200] } },
        }],
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
  build: { target: 'es2022', cssCodeSplit: false, modulePreload: false },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
