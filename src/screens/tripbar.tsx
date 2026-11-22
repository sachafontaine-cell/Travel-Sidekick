// Top of every trip screen: back to all trips (switch trip), and ⚙ This app.
import { Icon } from '../ui'
import { go, open } from '../lib/nav'

export function TripBar() {
  return (
    <div class="tripbar">
      <button class="pill press" onClick={() => go('#/')} aria-label="All trips"><Icon.back />Trips</button>
      <button class="iconbtn ring press" aria-label="This app: key, family link, alerts" onClick={() => open({ kind: 'sheet', name: 'app' })}><Icon.gear /></button>
    </div>
  )
}
