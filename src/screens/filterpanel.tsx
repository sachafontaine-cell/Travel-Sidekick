// One filter for Ideas, list and map alike (set it once, both show the same places):
// what to show, which types, which day, must-sees / free / kid-friendly, and (list) the order.
import { Seg } from '../ui'
import { createStore } from '../lib/store'
import { groupOf, type Group } from '../lib/groups'
import { GROUP_LIST } from '../lib/groupStyle'
import { tripDays } from '../lib/planner'
import { km } from '../lib/geo'
import type { Place, Trip } from '../lib/model'

export interface IdeaFilter {
  which: 'all' | 'picked' | 'maybe' | 'done'
  off: Group[]
  day: number | 'any' | 'none'
  must: boolean; free: boolean; kids: boolean
  sort: 'best' | 'value' | 'price' | 'near'
}
export const DEFAULT_FILTER: IdeaFilter = { which: 'all', off: [], day: 'any', must: false, free: false, kids: false, sort: 'best' }
export const ideaFilter = createStore<IdeaFilter>(DEFAULT_FILTER, 'idea-filter')
export const isCustom = (f: IdeaFilter) => JSON.stringify({ ...f, sort: 'best' }) !== JSON.stringify(DEFAULT_FILTER)

/** The places that pass the filter, best first (or in the chosen order). Skipped ones are never here. */
export function applyFilter(all: Place[], f: IdeaFilter, trip: Trip): Place[] {
  const base = trip.base ?? trip.dest
  const list = all.filter((p) => p.status !== 'out' && !(p.booked && p.kind === 'other')
    && (f.which === 'all' || (f.which === 'done' ? !!p.done : p.status === f.which && !p.done))
    && !f.off.includes(groupOf(p))
    && (f.day === 'any' || (f.day === 'none' ? p.day == null : p.day === f.day))
    && (!f.must || p.must) && (!f.free || p.price === 0) && (!f.kids || p.sub.kid >= 7))
  if (f.sort === 'value') list.sort((a, b) => b.value - a.value)
  else if (f.sort === 'price') list.sort((a, b) => a.price - b.price)
  else if (f.sort === 'near') list.sort((a, b) => km(base, a) - km(base, b))
  else list.sort((a, b) => Number(!!a.done) - Number(!!b.done) || Number(b.must) - Number(a.must) || b.worth - a.worth)
  return list
}

export function FilterPanel({ trip, all, shown, done, sort }: { trip: Trip; all: Place[]; shown: number; done: { label: string; onClick: () => void }; sort?: boolean }) {
  const f = ideaFilter.use()
  const set = (patch: Partial<IdeaFilter>) => ideaFilter.set({ ...f, ...patch })
  const live = all.filter((p) => p.status !== 'out' && !(p.booked && p.kind === 'other'))
  const count = (g: Group) => live.filter((p) => groupOf(p) === g).length
  const days = tripDays(trip)
  return (
    <div class="card card-pad stack mapfilters">
      <Seg label="Show" options={[['all', 'All'], ['picked', 'Wanted'], ['maybe', 'Not yet'], ['done', 'Done']]} value={f.which} onChange={(v) => set({ which: v })} />
      <div class="chips">
        {GROUP_LIST.filter(([g]) => count(g) > 0).map(([g, name, c]) => {
          const on = !f.off.includes(g)
          return <button class={`pill press${on ? ' on' : ''}`} aria-pressed={on} onClick={() => set({ off: on ? [...f.off, g] : f.off.filter((x) => x !== g) })}><span class="dot" style={{ background: c }} />{name} {count(g)}</button>
        })}
      </div>
      <div class="strip">
        {(['any', 'none', ...Array.from({ length: days }, (_, i) => i + 1)] as IdeaFilter['day'][]).map((d) => (
          <button class={`pill press${f.day === d ? ' on' : ''}`} aria-pressed={f.day === d} onClick={() => set({ day: d })}>{d === 'any' ? 'Any day' : d === 'none' ? 'No day yet' : `Day ${d}`}</button>
        ))}
      </div>
      <div class="chips">
        <button class={`pill press${f.must ? ' on' : ''}`} aria-pressed={f.must} onClick={() => set({ must: !f.must })}>★ Must-sees</button>
        <button class={`pill press${f.free ? ' on' : ''}`} aria-pressed={f.free} onClick={() => set({ free: !f.free })}>Free</button>
        <button class={`pill press${f.kids ? ' on' : ''}`} aria-pressed={f.kids} onClick={() => set({ kids: !f.kids })}>Kid-friendly</button>
      </div>
      {sort && <Seg label="Order" options={[['best', 'Best first'], ['value', 'Value'], ['price', 'Cheapest'], ['near', 'Nearest']]} value={f.sort} onChange={(v) => set({ sort: v })} />}
      <div class="row">
        {isCustom(f) && <button class="btn btn-quiet press" onClick={() => ideaFilter.set({ ...DEFAULT_FILTER, sort: f.sort })}>Reset</button>}
        <button class="btn btn-primary grow press" onClick={done.onClick}>{done.label.replace('{n}', String(shown))}</button>
      </div>
    </div>
  )
}
