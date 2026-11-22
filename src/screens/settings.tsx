// Trips → ⚙ This app: who this phone is, the Gemini key, the family script, email alerts, version.
// These aren't trip settings, so they don't live in Trip Setup.
import { useEffect, useState } from 'preact/hooks'
import { Icon, Sheet, Spinner } from '../ui'
import { settings, trips } from '../lib/data'
import { flashModels, AiError } from '../lib/gemini'
import { connected, familyKey, setAlerts, shareKey, syncNow, syncState } from '../lib/sync'
import { applyUpdate, checkForUpdate } from '../lib/update'
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
      setState({ ok: shared ? 'Key saved, and shared with the other phone.' : 'Key saved on this phone.' })
    } catch (e) {
      if (e instanceof AiError && e.status === 0) {
        settings.set({ ...settings.get(), geminiKey: k, geminiModel: undefined })
        setKey(''); setChange(false)
        setState({ ok: 'Key saved. No connection to check it now: it will be checked on first use.' })
      } else setState({ err: e instanceof Error ? e.message : 'Could not check the key.' })
    }
  }
  const paste = async () => {
    try {
      const t = await navigator.clipboard.readText()
      if (t.trim()) { setKey(t.trim()); void save(t) } else setState({ err: 'The clipboard is empty: copy the key in AI Studio.' })
    } catch { setState({ err: 'Paste was blocked: paste the key in the box below.' }) }
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
        <li>Open AI Studio, tap <b>Create API key</b>, and pick <b>Create in new project</b> (its own free allowance). Copy the key.</li>
        <li>Come back here and tap <b>Paste key</b>.</li>
      </ol>
      <a class="btn btn-secondary press" href={AI_STUDIO} target="_blank" rel="noopener">Get a key<Icon.out /></a>
      {'clipboard' in navigator && <button class="btn btn-primary press" disabled={!!state.busy} onClick={paste}>Paste key</button>}
      <div class="row">
        <input class="field grow" type="password" autocomplete="off" spellcheck={false} placeholder="or paste it here" value={key} onInput={(e) => setKey((e.target as HTMLInputElement).value)} onKeyDown={(e) => { if (e.key === 'Enter') void save(key) }} />
        <button class="btn btn-primary btn-sm press" disabled={!key.trim() || !!state.busy} onClick={() => save(key)}>OK</button>
      </div>
      {state.busy && <div class="row muted"><Spinner />{state.busy}</div>}
      {state.err && <p class="answer err">{state.err}</p>}
      <p class="muted small">Free: never turn on billing in that Google project. The key stays on your phones, never in a backup or the code.</p>
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
  if (!connected()) return (
    <div class="stack">
      <p class="muted">Not connected. Open the family link once on this phone (from the Google script setup). Until then, everything stays on this phone.</p>
      {familyKey() && <p class="muted small">Family key found (Control Center); the script address is still missing.</p>}
    </div>
  )
  const ago = st.at ? Math.max(0, Math.round((Date.now() - st.at) / 60000)) : null
  return (
    <div class="stack">
      <div class="row"><span class={`chip ${st.error ? 'amber' : 'ok'}`}>{st.error ? 'Sync problem' : 'Connected'}</span><span class="muted small">{st.error ? st.error : ago == null ? 'Not synced yet' : ago < 1 ? 'Synced just now' : `Synced ${ago} min ago`}{st.script ? ` · script v${st.script}` : ''}</span></div>
      <button class="btn btn-quiet btn-sm press" onClick={() => void syncNow()}>Sync now</button>
    </div>
  )
}

function Alerts() {
  const s = settings.use()
  const [text, setText] = useState((s.alerts ?? []).join(', '))
  const [msg, setMsg] = useState('')
  if (!connected()) return <p class="muted">Email alerts come from the family script: connect it first.</p>
  const save = async () => {
    const emails = text.split(/[,\s]+/).map((x) => x.trim()).filter((x) => /.+@.+\..+/.test(x))
    settings.set({ ...settings.get(), alerts: emails })
    try { await setAlerts(emails); setMsg('Saved.') } catch { setMsg('Saved here; the script could not be reached. Try again later.') }
  }
  return (
    <div class="stack">
      <p class="muted small">Must-see closed on its day, and the "download the language" reminder 3 days before.</p>
      <div class="row"><input class="field grow" type="email" inputMode="email" placeholder="you@example.com, partner@example.com" value={text} onInput={(e) => setText((e.target as HTMLInputElement).value)} /><button class="btn btn-primary btn-sm press" onClick={save}>Save</button></div>
      {msg && <p class="muted small">{msg}</p>}
    </div>
  )
}

function Version() {
  const [state, setState] = useState<'idle' | 'checking' | 'ready' | 'latest'>('idle')
  useEffect(() => { if (state === 'latest') { const t = setTimeout(() => setState('idle'), 3000); return () => clearTimeout(t) } }, [state])
  return (
    <button class="ver press" onClick={async () => { if (state === 'ready') return applyUpdate(); setState('checking'); setState((await checkForUpdate()) ? 'ready' : 'latest') }}>
      v{__VERSION__} {state === 'checking' ? <Spinner /> : <Icon.refresh />}{state === 'ready' ? 'Update ready: tap to reload' : state === 'latest' ? 'Up to date' : ''}
    </button>
  )
}

export function AppSheet() {
  return (
    <Sheet title="This app">
      <div class="stack"><span class="label">This phone</span><Me /></div>
      <div class="stack"><span class="label">Gemini key</span><KeyBox /></div>
      <div class="stack"><span class="label">Family script (sync, emails)</span><Family /></div>
      <div class="stack"><span class="label">Email alerts</span><Alerts /></div>
      <Version />
    </Sheet>
  )
}
