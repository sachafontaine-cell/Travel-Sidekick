// The Trip tab: links out (Google Translate, KAYAK), local rules, setup. Snap arrives in 1.1.
import { Icon } from '../ui'
import { EmailCheck } from './email'
import { nowIn, trips } from '../lib/data'
import { go, open, tripPath } from '../lib/nav'
import { langName } from '../lib/money'
import { translateUrl } from './today'
import type { Trip } from '../lib/model'

export function TripTab({ trip }: { trip: Trip }) {
  const t = trips.use()[trip.id] ?? trip
  const now = nowIn(t)
  const out = (href: string, label: string, sub: string) => (
    <a class="kv press" href={href} target="_blank" rel="noopener"><span class="stack" style={{ gap: '1px' }}><span class="strong">{label}</span><span class="muted small">{sub}</span></span><Icon.out /></a>
  )
  return (
    <main class="main">
      <div class="between"><h1 class="h1">{t.name} trip</h1><button class="link press" onClick={() => go('#/')}>All trips</button></div>
      <div class="list">
        {t.dest.lang !== 'en' && out(translateUrl(t), 'Google Translate', `Talk, signs and menus in ${langName(t.dest.lang)}`)}
        {out('https://www.kayak.com/trips', 'KAYAK Trips', 'Flights, hotels, bookings and documents')}
        {out(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(t.dest.name)}`, 'Google Maps', 'Directions and offline maps')}
      </div>
      <div class="list"><EmailCheck /></div>
      <div class="list">
        <button class="kv press" onClick={() => open({ kind: 'sheet', name: 'rules' })}><span class="strong">Local rules</span><span class="v">{t.rules?.length ? `${t.rules.length} tips` : 'Coming'}<Icon.chev /></span></button>
        <button class="kv press" onClick={() => go(tripPath(t.id, 'setup'))}><span class="strong">Trip setup</span><span class="v"><span class="trunc">Dates, people, vibe, day shape</span><Icon.chev /></span></button>
      </div>
      {now.day < 1 && <p class="muted small">Before you go: the checklist is on Today.</p>}
    </main>
  )
}
