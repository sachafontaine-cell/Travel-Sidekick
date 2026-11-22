// Draws the app icons (run once: node scripts/icons.mjs). Needs Playwright's Chromium.
// Full-bleed navy with a gold compass star, so Android never adds a white border.
import { createRequire } from 'node:module'
const { chromium } = createRequire(import.meta.url)('playwright')
const star = (scale, bg) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  ${bg}
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
    <circle cx="256" cy="256" r="150" fill="none" stroke="#F7F3EA" stroke-width="14" opacity=".9"/>
    <path d="M256 70 L290 222 L442 256 L290 290 L256 442 L222 290 L70 256 L222 222 Z" fill="#D9A21B"/>
    <path d="M256 70 L290 222 L256 256 Z M442 256 L290 290 L256 256 Z M256 442 L222 290 L256 256 Z M70 256 L222 222 L256 256 Z" fill="#B5850F"/>
    <circle cx="256" cy="256" r="20" fill="#14213D"/>
  </g></svg>`
const full = '<rect width="512" height="512" fill="#14213D"/>'
const b = await chromium.launch(), p = await b.newPage()
for (const [file, size, svg] of [['icon-512.png', 512, star(0.86, full)], ['icon-192.png', 192, star(0.86, full)], ['apple-touch-icon.png', 180, star(0.8, full)], ['favicon.png', 64, star(0.95, full)], ['icon-maskable.png', 512, star(0.66, full)]]) {
  await p.setViewportSize({ width: size, height: size })
  await p.setContent(`<body style="margin:0;background:transparent">${svg.replace('width="512" height="512"', `width="${size}" height="${size}"`)}</body>`)
  await p.screenshot({ path: 'public/' + file, omitBackground: true })
}
await b.close()
