// "Bookings from your email": the family script reads new booking emails (and the KAYAK
// calendar) every hour in the background. This shows when it last did, and asks for a check now.
import { useState } from 'preact/hooks'
import { Icon, Spinner } from '../ui'
import { settings } from '../lib/data'
import { connected, scanEmail, SCRIPT_NEEDED, shareKey, syncState } from '../lib/sync'

const ago = (t: number) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago` }

export function EmailCheck({ label = 'Bookings from your email' }: { label?: string }) {
  const st = syncState.use()
  settings.use()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  if (!connected()) return null
  const old = (st.script ?? 0) < SCRIPT_NEEDED
  const scan = st.scan
  const waiting = st.asked && (!scan || scan.at < st.asked) && Date.now() - st.asked < 5 * 60000
  const line = old ? 'Script updating… (see ⚙ if this stays)'
    : waiting ? 'Checking email… results in a minute or two.'
    : scan?.error ? `Last check failed: ${scan.error}`
    : scan ? `Checked ${ago(scan.at)}${scan.added ? ` · ${scan.added} booking${scan.added > 1 ? 's' : ''} added` : ''}${scan.trips ? ` · ${scan.trips} new trip${scan.trips > 1 ? 's' : ''}` : ''} · checks every hour`
    : 'Checked every hour, in the background.'
  const run = async () => {
    setBusy(true); setErr('')
    try {
      const k = settings.get().geminiKey
      if (k && !settings.get().keyShared) await shareKey(k)
      await scanEmail()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not reach the family script.') } finally { setBusy(false) }
  }
  return (
    <div class="stack">
      <button class="kv press" disabled={busy || old} onClick={run}>
        <span class="stack" style={{ gap: '1px', minWidth: 0 }}><span class="strong">{label}</span><span class={`small ${scan?.error ? 'warn' : 'muted'}`}>{line}</span></span>
        {busy ? <Spinner /> : <span class="v">Check now<Icon.chev /></span>}
      </button>
      {err && <p class="answer err">{err}</p>}
    </div>
  )
}
