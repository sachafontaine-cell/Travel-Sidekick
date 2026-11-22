// Vibe shares in 10% steps that always add up to 100%: + takes from the biggest other share,
// − gives to the biggest other share. Pick as many as you like.
import type { Vibe } from './model'

export type Shares = Partial<Record<Vibe, number>>
const STEP = 10

const others = (s: Shares, v: Vibe) => (Object.keys(s) as Vibe[]).filter((k) => k !== v && (s[k] ?? 0) > 0)
const biggest = (s: Shares, ks: Vibe[]) => ks.reduce<Vibe | undefined>((b, k) => (b === undefined || (s[k] ?? 0) > (s[b] ?? 0) ? k : b), undefined)
const clean = (s: Shares): Shares => Object.fromEntries(Object.entries(s).filter(([, n]) => (n ?? 0) > 0))

export function plus(s: Shares, v: Vibe): Shares {
  const total = Object.values(s).reduce((a, n) => a + (n ?? 0), 0)
  if (total === 0) return { [v]: 100 }
  const from = biggest(s, others(s, v))
  if (!from) return s // already 100%
  return clean({ ...s, [v]: (s[v] ?? 0) + STEP, [from]: (s[from] ?? 0) - STEP })
}

export function minus(s: Shares, v: Vibe): Shares {
  if (!(s[v] ?? 0)) return s
  const to = biggest(s, others(s, v))
  if (!to) return {} // the only vibe: back to none picked
  return clean({ ...s, [v]: (s[v] ?? 0) - STEP, [to]: (s[to] ?? 0) + STEP })
}

/** "Cultural 50 · Family 30 · Food 20", biggest first. */
export function describe(s: Shares, names: Record<string, string>): string {
  const e = (Object.entries(s) as [Vibe, number][]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])
  return e.length ? e.map(([k, n]) => `${names[k] ?? k} ${n}`).join(' · ') : 'None picked'
}
