// Gemini (free tier). The key is pasted once in Trips → This app and stays on the phones.
// When the newest model is busy (common on the free tier), the next one is tried, and the one
// that answered is remembered. Same approach as Chef Luc and Wardrobe COO.

const API = 'https://generativelanguage.googleapis.com/v1beta'

export class AiError extends Error {
  constructor(message: string, readonly status = 0, readonly retry = false) { super(message) }
}

/** Quick answers: little hidden "thinking" (it only adds waiting). */
function thinkingFor(model: string): object | undefined {
  if (/^gemini-2\.5/.test(model)) return { thinkingBudget: 0 }
  if (/^gemini-[3-9]|flash-latest/.test(model)) return { thinkingLevel: 'low' }
  return undefined
}

async function failure(r: Response, model: string, thinking: boolean): Promise<AiError | 'drop-thinking'> {
  let msg = ''
  try { msg = String((await r.json())?.error?.message ?? '') } catch { /* not JSON */ }
  if (r.status === 400 && thinking && /think/i.test(msg)) return 'drop-thinking'
  const short = msg.split(/(?<=\.)\s/)[0].slice(0, 120)
  if (r.status === 429) return new AiError('Free limit reached for the moment. Try again in a minute.', 429, true)
  if (r.status === 400 && /api key/i.test(msg)) return new AiError('Gemini key refused. Check it in Trips → This app.', 400)
  if (r.status === 403) return new AiError('Gemini key refused (restricted, or the API is off). Check it in Trips → This app.', 403)
  if (r.status === 404) return new AiError(`Model ${model} is not available for this key.`, 404, true)
  if (r.status >= 500) return new AiError('Gemini is busy right now.', r.status, true)
  return new AiError(`Gemini error ${r.status}${short ? ` (${short})` : ''}`, r.status)
}

function prepare(model: string, body: Record<string, unknown>, thinking: boolean) {
  const gen = { ...(body.generationConfig as object | undefined) } as Record<string, unknown>
  const t = thinking ? thinkingFor(model) : undefined
  if (t) gen.thinkingConfig = t
  return { payload: JSON.stringify({ ...body, generationConfig: gen }), thinking: !!t }
}

function netError(e: unknown, aborted: boolean): AiError {
  if (e instanceof AiError) return e
  if (aborted) return new AiError('Gemini took too long to answer.', 0, true)
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return new AiError('No internet connection.', 0)
  return new AiError('Lost the connection to Gemini.', 0, true)
}

export async function generate(key: string, model: string, body: Record<string, unknown>, opts: { timeoutMs?: number; thinking?: boolean } = {}): Promise<any> {
  const { payload, thinking } = prepare(model, body, opts.thinking !== false)
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 45000)
  try {
    const r = await fetch(`${API}/models/${model}:generateContent?key=${encodeURIComponent(key)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, signal: ctrl.signal })
    if (!r.ok) {
      const f = await failure(r, model, thinking)
      if (f === 'drop-thinking') return generate(key, model, body, { ...opts, thinking: false })
      throw f
    }
    return await r.json()
  } catch (e) { throw netError(e, ctrl.signal.aborted) } finally { clearTimeout(timer) }
}

/** Streams the answer: `onText` gets the full text so far after each piece. */
export async function stream(key: string, model: string, body: Record<string, unknown>, onText: (all: string) => void, opts: { stallMs?: number; thinking?: boolean } = {}): Promise<string> {
  const { payload, thinking } = prepare(model, body, opts.thinking !== false)
  const ctrl = new AbortController()
  // A search-grounded answer can take a while to start (it searches first).
  let timer = setTimeout(() => ctrl.abort(), Math.max(30000, opts.stallMs ?? 0))
  const poke = () => { clearTimeout(timer); timer = setTimeout(() => ctrl.abort(), opts.stallMs ?? 25000) }
  let all = ''
  try {
    const r = await fetch(`${API}/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, signal: ctrl.signal })
    if (!r.ok || !r.body) {
      const f = await failure(r, model, thinking)
      if (f === 'drop-thinking') return stream(key, model, body, onText, { ...opts, thinking: false })
      throw f
    }
    const reader = r.body.getReader()
    const dec = new TextDecoder()
    let buf = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      poke()
      buf += dec.decode(value, { stream: true })
      let i
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim()
        buf = buf.slice(i + 1)
        if (!line.startsWith('data:')) continue
        try { const piece = answerText(JSON.parse(line.slice(5))); if (piece) { all += piece; onText(all) } } catch { /* partial line */ }
      }
    }
    return all
  } catch (e) {
    if (all && !(e instanceof AiError)) return all // keep what arrived before a stall
    throw netError(e, ctrl.signal.aborted)
  } finally { clearTimeout(timer) }
}

/** The text of an answer, without the model's hidden reasoning. */
export function answerText(j: any): string {
  return (j?.candidates?.[0]?.content?.parts ?? []).filter((p: any) => typeof p.text === 'string' && !p.thought).map((p: any) => p.text).join('')
}

/** Flash models this key can use, best first. Also how a key is checked (no request spent). */
export async function flashModels(key: string): Promise<string[]> {
  let r: Response
  try { r = await fetch(`${API}/models?pageSize=200&key=${encodeURIComponent(key)}`) } catch { throw new AiError('No internet connection.') }
  if (r.status === 400 || r.status === 403) throw new AiError('Key refused. Copy it again from AI Studio.', r.status)
  if (!r.ok) throw new AiError(`Gemini error ${r.status}`, r.status)
  const j = (await r.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] }
  const names = (j.models ?? []).filter((m) => m.supportedGenerationMethods?.includes('generateContent')).map((m) => m.name.replace(/^models\//, ''))
  const v = (n: string) => parseFloat(n.slice(7)) || 0
  const pick = (re: RegExp) => names.filter((n) => re.test(n)).sort((a, b) => v(b) - v(a))
  return [...new Set([
    ...pick(/^gemini-[\d.]+-flash$/).slice(0, 3),
    ...names.filter((n) => n === 'gemini-flash-latest'),
    ...pick(/^gemini-[\d.]+-flash-lite$/).slice(0, 2),
    ...names.filter((n) => n === 'gemini-flash-lite-latest'),
    ...pick(/^gemini-[\d.]+-flash(-lite)?-preview(-[\d-]+)?$/).slice(0, 2),
  ])]
}

// ---- Model health: a busy model is skipped for 15 minutes; the last one that answered goes first.
const HEALTH = 'ts:models'
interface Health { busy: Record<string, number>; good?: string }
const readHealth = (): Health => { try { return { busy: {}, ...JSON.parse(localStorage.getItem(HEALTH) ?? '{}') } } catch { return { busy: {} } } }
const writeHealth = (h: Health) => { try { localStorage.setItem(HEALTH, JSON.stringify(h)) } catch { /* no storage */ } }
const markBusy = (m: string) => { const h = readHealth(); h.busy[m] = Date.now() + 15 * 60000; if (h.good === m) h.good = undefined; writeHealth(h) }
const markGood = (m: string) => { const h = readHealth(); delete h.busy[m]; h.good = m; writeHealth(h) }

export function modelOrder(preferred: string | undefined, available: string[], now = Date.now()): string[] {
  const h = readHealth()
  const pool = [...new Set([h.good, preferred, ...available].filter((m): m is string => !!m && (!available.length || available.includes(m) || m === preferred)))]
  const busy = (m: string) => (h.busy[m] ?? 0) > now
  return [...pool.filter((m) => !busy(m)), ...pool.filter(busy).sort((a, b) => h.busy[a] - h.busy[b])]
}

let modelsCache: { key: string; list: string[]; at: number } | undefined
async function models(key: string): Promise<string[]> {
  if (modelsCache && modelsCache.key === key && Date.now() - modelsCache.at < 6 * 3600000) return modelsCache.list
  const list = await flashModels(key)
  modelsCache = { key, list, at: Date.now() }
  return list
}

/** One call, moving to the next model while one is busy. */
export async function withModels<T>(key: string, preferred: string | undefined, run: (model: string) => Promise<T>): Promise<{ out: T; model: string }> {
  let available: string[] = []
  try { available = await models(key) } catch (e) { if (!preferred) throw e }
  const order = modelOrder(preferred, available).slice(0, 5)
  if (!order.length) throw new AiError('No Gemini Flash model is available for this key.')
  let last: unknown
  for (const [i, model] of [...order, order[0]].entries()) {
    if (i === order.length) await new Promise((r) => setTimeout(r, 2500))
    try { const out = await run(model); markGood(model); return { out, model } } catch (e) {
      last = e
      if (!(e instanceof AiError && e.retry)) throw e
      markBusy(model)
    }
  }
  const e = last as AiError
  if ([429, 500, 502, 503, 504].includes(e.status)) throw new AiError('Gemini is busy right now. Try again in a minute.', e.status, true)
  throw e
}

/** Pulls a JSON value out of a reply that may be wrapped in ```json fences or prose. */
export function jsonIn<T>(text: string, shape: 'array' | 'object' = 'array'): T | null {
  const t = text.replace(/```(?:json)?/g, '').trim()
  const shapes = [['[', ']'], ['{', '}']] as const
  for (const [open, shut] of shape === 'array' ? shapes : [shapes[1], shapes[0]]) {
    const a = t.indexOf(open), b = t.lastIndexOf(shut)
    if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)) as T } catch { /* try the other shape */ } }
  }
  return null
}
