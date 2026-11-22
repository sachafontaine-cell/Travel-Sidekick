// Draws the app icons (run once: node scripts/icons.mjs [pin|suitcase|plane]). Needs Playwright's Chromium.
// Full-bleed navy in every size, so Android never adds a white border. Designs: scripts/icon-designs.mjs.
import { createRequire } from 'node:module'
import { icon } from './icon-designs.mjs'
const { chromium } = createRequire(import.meta.url)('playwright')
const design = process.argv[2] ?? 'suitcase'
const b = await chromium.launch(), p = await b.newPage()
for (const [file, size, scale] of [['icon-512.png', 512, 0.86], ['icon-192.png', 192, 0.86], ['apple-touch-icon.png', 180, 0.82], ['favicon.png', 64, 0.95], ['icon-maskable.png', 512, 0.66]]) {
  await p.setViewportSize({ width: size, height: size })
  await p.setContent(`<body style="margin:0;background:transparent">${icon(design, scale).replace('width="512" height="512"', `width="${size}" height="${size}"`)}</body>`)
  await p.screenshot({ path: 'public/' + file, omitBackground: true })
}
await b.close()
