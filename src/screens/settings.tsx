// Trips → ⚙ This app: who this phone is, the Gemini key, the family script, email alerts, version.
// These aren't trip settings, so they don't live in Trip Setup.
import { useEffect, useState } from 'preact/hooks'
import { Icon, Sheet, Spinner } from '../ui'
import { settings, trips } from '../lib/data'
import { flashModels, AiError } from '../lib/gemini'
import { connected, familyKey, SCRIPT_NEEDED, setAlerts, setKayak, shareKey, syncNow, syncState } from '../lib/sync'
import { updateNow } from '../lib/update'
import { DEMO } from '../lib/store'

const AI_STUDIO = 'https://aistudio.google.com/apikey'

function KeyBox() {
  const s = settings.use()
  const [key, setKey] = useState('')
  const [state, setState] = useState<{ busy?: string; err?: string; ok?: string }>({})
  const [change, setChange] = useState(!s.geminiKey)
  // Checking a key only lists the models (about a second): no request is spent.
  const save = async (raw: string) => {
    const k = raw.trim()
    if (!k) return
    setState({ busy: 'Checking the key…' })
    try {
      const models = await flashModels(k)
      if (!models.length) throw new AiError('No Gemini Flash model is available for this key.')
      settings.set({ ...settings.get(), geminiKey: k, geminiModel: models[0] })
      setKey(''); setChange(false)
      const shared = await shareKey(k)
      setState({ ok: shared ? 'Key saved and shared.' : 'Key saved on this phone.' })
    } catch (e) {
      if (e instanceof AiError && e.status === 0) {
        settings.set({ ...settings.get(), geminiKey: k, geminiModel: undefined })
        setKey(''); setChange(false)
        setState({ ok: 'Key saved. Checked on first use.' })
      } else setState({ err: e instanceof Error ? e.message : 'Could not check the key.' })
    }
  }
  const paste = async () => {
    try {
      const t = await navigator.clipboard.readText()
      if (t.trim()) { setKey(t.trim()); void save(t) } else setState({ err: 'Clipboard empty: copy the key first.' })
    } catch { setState({ err: 'Paste blocked: use the box below.' }) }
  }
  if (!change && s.geminiKey) {
    return (
      <div class="stack">
        <div class="row"><span class="chip ok"><Icon.check />Key saved</span><span class="muted small">{s.geminiModel ?? ''}</span></div>
        {state.ok && <p class="muted">{state.ok}</p>}
        <button class="link press" onClick={() => { setChange(true); setState({}) }}>Change the key</button>
      </div>
    )
  }
  return (
    <div class="stack">
      <ol class="muted" style={{ margin: 0, paddingLeft: '20px' }}>
        <li>In AI Studio: <b>Create API key</b> → <b>Create in new project</b>. Copy it.</li>
        <li>Tap <b>Paste key</b>.</li>
      </ol>
      <a class="btn btn-secondary press" href={AI_STUDIO} target="_blank" rel="noopener">Get a key<Icon.out /></a>
      {'clipboard' in navigator && <button class="btn btn-primary press" disabled={!!state.busy} onClick={paste}>Paste key</button>}
      <div class="row">
        <input class="field grow" type="password" autocomplete="off" spellcheck={false} placeholder="or paste it here" value={key} onInput={(e) => setKey((e.target as HTMLInputElement).value)} onKeyDown={(e) => { if (e.key === 'Enter') void save(key) }} />
        <button class="btn btn-primary btn-sm press" disabled={!key.trim() || !!state.busy} onClick={() => save(key)}>OK</button>
      </div>
      {state.busy && <div class="row muted"><Spinner />{state.busy}</div>}
      {state.err && <p class="answer err">{state.err}</p>}
      <p class="muted small">Free as long as billing stays off. Stored only on your phones.</p>
    </div>
  )
}

function Me() {
  const s = settings.use()
  const names = [...new Set(Object.values(trips.get()).flatMap((t) => t.people.filter((p) => p.age >= 18).map((p) => p.name)))].filter(Boolean)
  if (!names.length) return <p class="muted">Add the travelers in a trip first.</p>
  return <div class="chips">{names.map((n) => <button class={`pill press${s.me === n ? ' on' : ''}`} aria-pressed={s.me === n} onClick={() => settings.set({ ...settings.get(), me: n })}>{n}</button>)}</div>
}

function Family() {
  const st = syncState.use()
  settings.use()
  if (DEMO) return <p class="muted">The sample trip never syncs.</p>
  const bad = settings.get().badApi
  if (!connected()) return (
    <div class="stack">
      {bad && <p class="answer err">The family link's script address is wrong ("{bad}"). It must end with the Web app URL: https://script.google.com/macros/s/…/exec (Deploy → Manage deployments).</p>}
      <p class="muted">Not connected. Open the family link once on this phone.</p>
      {familyKey() && <p class="muted small">Family key found; script address missing.</p>}
    </div>
  )
  const ago = st.at ? Math.max(0, Math.round((Date.now() - st.at) / 60000)) : null
  return (
    <div class="stack">
      <div class="row"><span class={`chip ${st.error ? 'amber' : 'ok'}`}>{st.error ? 'Sync problem' : 'Connected'}</span><span class="muted small">{st.error ? st.error : ago == null ? 'Not synced yet' : ago < 1 ? 'Synced just now' : `Synced ${ago} min ago`}{st.script ? ` · script v${st.script}` : ''}</span></div>
      <p class="muted small">Keeps both phones the same, reads booking emails, and gives Google Maps times and locations.</p>
      <button class="btn btn-quiet press" onClick={() => void syncNow()}><Icon.refresh />Sync now</button>
      <span class="label">Add the other phone</span>
      <FamilyLink />
    </div>
  )
}

/** The family link, to open once on the other phone. It holds the family key: keep it private. */
function FamilyLink() {
  const [shown, setShown] = useState(false)
  const [msg, setMsg] = useState('')
  const link = `${location.origin}${import.meta.env.BASE_URL}?k=${encodeURIComponent(familyKey())}&api=${settings.get().api ?? ''}`
  const copy = async () => { try { await navigator.clipboard.writeText(link); setMsg('Copied.') } catch { setShown(true); setMsg('Copy blocked: select the link below.') } }
  const share = async () => { try { await navigator.share({ title: 'Travel Sidekick family link', text: 'Open once on your phone (keep it private):', url: link }) } catch { /* closed */ } }
  return (
    <div class="stack">
      <span class="muted small">Open this link once on the other phone. It holds your family key: keep it private.</span>
      <div class="row">
        <button class="btn btn-quiet btn-sm grow press" onClick={copy}>Copy link</button>
        {'share' in navigator && <button class="btn btn-quiet btn-sm grow press" onClick={share}>Share</button>}
        <button class="btn btn-quiet btn-sm press" onClick={() => setShown(!shown)}>{shown ? 'Hide' : 'Show'}</button>
      </div>
      {shown && <span class="linkbox">{link}</span>}
      {msg && <span class="muted small">{msg}</span>}
    </div>
  )
}

function Alerts() {
  const s = settings.use()
  const [text, setText] = useState((s.alerts ?? []).join(', '))
  const [msg, setMsg] = useState('')
  if (!connected()) return <p class="muted">Connect the family script first.</p>
  const save = async () => {
    const emails = text.split(/[,\s]+/).map((x) => x.trim()).filter((x) => /.+@.+\..+/.test(x))
    settings.set({ ...settings.get(), alerts: emails })
    try { await setAlerts(emails); setMsg('Saved.') } catch { setMsg('Saved here. Script unreachable: try later.') }
  }
  return (
    <div class="stack">
      <p class="muted small">An email when a must-see is closed on its day, and a reminder 3 days before to download the language.</p>
      <div class="row"><input class="field grow" type="email" inputMode="email" placeholder="you@example.com, partner@example.com" value={text} onInput={(e) => setText((e.target as HTMLInputElement).value)} /><button class="btn btn-primary btn-sm press" onClick={save}>Save</button></div>
      {msg && <p class="muted small">{msg}</p>}
    </div>
  )
}

function Version() {
  const [state, setState] = useState<'idle' | 'checking' | 'latest'>('idle')
  useEffect(() => { if (state === 'latest') { const t = setTimeout(() => setState('idle'), 3000); return () => clearTimeout(t) } }, [state])
  return (
    <button class="setrow press" disabled={state === 'checking'} onClick={async () => { setState('checking'); if ((await updateNow()) === 'latest') setState('latest') }}>
      <span class="seticon">{state === 'checking' ? <Spinner /> : <Icon.refresh />}</span>
      <span class="grow strong">Version {__VERSION__}</span>
      <span class={`setval${state === 'latest' ? ' ok' : ''}`}>{state === 'checking' ? 'Checking…' : state === 'latest' ? <><Icon.check />Up to date</> : 'Check for update'}</span>
    </button>
  )
}

function Kayak() {
  const s = settings.use()
  const [url, setUrl] = useState(s.kayak ?? '')
  const [msg, setMsg] = useState('')
  if (!connected()) return <p class="muted">Connect the family script first.</p>
  const save = async () => {
    try { await setKayak(url.trim()); settings.set({ ...settings.get(), kayak: url.trim() }); setMsg(url.trim() ? 'Saved.' : 'Removed.') } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not save.') }
  }
  return (
    <div class="stack">
      <p class="muted small">Your KAYAK trips join the app. In KAYAK: Trips → Settings → Calendar sync → copy the link, then paste it here.</p>
      <div class="row"><input class="field grow" inputMode="url" placeholder="https://www.kayak.com/trips/ical/…" value={url} onInput={(e) => setUrl((e.target as HTMLInputElement).value)} /><button class="btn btn-primary btn-sm press" onClick={save}>Save</button></div>
      {msg && <p class="muted small">{msg}</p>}
    </div>
  )
}

type Page = 'main' | 'me' | 'key' | 'family' | 'alerts' | 'kayak'
const ago = (at?: number) => { if (!at) return 'not yet'; const m = Math.max(0, Math.round((Date.now() - at) / 60000)); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago` }

/** One settings row: label, its state on the right (✓ when fine, gold when it needs you), chevron. */
function Item({ icon, label, value, tone, onClick }: { icon: preact.JSX.Element; label: string; value: string; tone?: 'ok' | 'todo' | 'bad'; onClick: () => void }) {
  return (
    <button class="setrow press" onClick={onClick}>
      <span class="seticon">{icon}</span>
      <span class="grow strong">{label}</span>
      <span class={`setval ${tone ?? ''}`}>{tone === 'ok' && <Icon.check />}{value}</span>
      <Icon.chev />
    </button>
  )
}

/** ⚙ This app: what's set up at a glance, each setting one tap away. */
export function AppSheet({ start }: { start?: 'key' } = {}) {
  const s = settings.use()
  const st = syncState.use()
  const [page, setPage] = useState<Page>(start ?? 'main')
  const back = () => setPage('main')
  const linked = connected()
  const scriptOld = linked && (st.script ?? 0) > 0 && (st.script ?? 0) < SCRIPT_NEEDED
  const adults = new Set(Object.values(trips.get()).flatMap((t) => t.people.filter((p) => p.age >= 18).map((p) => p.name)).filter(Boolean)).size
  const todo = [!s.geminiKey && 'Gemini', !DEMO && !linked && 'family sync', linked && st.error && 'sync', scriptOld && 'script update', adults > 1 && !s.me && 'this phone'].filter(Boolean) as string[]

  if (page === 'me') return <Sheet title="This phone" onBack={back}><p class="muted small">Whose phone is this? Used for "Marie wants it" in Help me choose.</p><Me /></Sheet>
  if (page === 'key') return <Sheet title="Gemini" onBack={back}><KeyBox /></Sheet>
  if (page === 'family') return <Sheet title="Family sync" onBack={back}><Family /></Sheet>
  if (page === 'alerts') return <Sheet title="Email alerts" onBack={back}><Alerts /></Sheet>
  if (page === 'kayak') return <Sheet title="KAYAK calendar" onBack={back}><Kayak /></Sheet>

  return (
    <Sheet title="This app">
      <div class={`setstatus ${todo.length ? 'todo' : 'ok'}`}>
        {todo.length ? <><b>{todo.length} thing{todo.length > 1 ? 's' : ''} to set up</b><span class="small">{todo.join(' · ')}</span></> : <><b><Icon.check />All set</b><span class="small">{DEMO ? 'Sample trip: nothing syncs.' : `Synced ${ago(st.at)} · script v${st.script ?? '?'}`}</span></>}
      </div>

      <div class="setgroup">
        <Item icon={<Icon.chat />} label="Gemini (AI)" value={s.geminiKey ? 'Connected' : 'Add key'} tone={s.geminiKey ? 'ok' : 'todo'} onClick={() => setPage('key')} />
        <Item icon={<Icon.refresh />} label="Family sync" value={DEMO ? 'Off (sample)' : !linked ? 'Not connected' : st.error ? 'Problem' : scriptOld ? 'Update needed' : `Synced ${ago(st.at)}`} tone={DEMO ? undefined : !linked ? 'todo' : st.error || scriptOld ? 'bad' : 'ok'} onClick={() => setPage('family')} />
        <Item icon={<Icon.user />} label="This phone" value={s.me ?? (adults > 1 ? 'Choose' : '–')} tone={s.me ? undefined : adults > 1 ? 'todo' : undefined} onClick={() => setPage('me')} />
      </div>

      <div class="setgroup">
        <Item icon={<Icon.mail />} label="Email alerts" value={s.alerts?.length ? `${s.alerts.length} address${s.alerts.length > 1 ? 'es' : ''}` : 'Off'} onClick={() => setPage('alerts')} />
        <Item icon={<Icon.plan />} label="KAYAK calendar" value={s.kayak ? 'On' : 'Off'} onClick={() => setPage('kayak')} />
      </div>

      <div class="setgroup">
        <Version />
        <a class="setrow press" href="https://github.com/sachafontaine-cell/Travel-Sidekick#one-time-setup" target="_blank" rel="noopener"><span class="seticon"><Icon.out /></span><span class="grow strong">Setup guide</span><Icon.chev /></a>
      </div>
    </Sheet>
  )
}
