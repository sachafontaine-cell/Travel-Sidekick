// Plan → Map: every place on a map. Pick what to show first (filters), then the pins; tap a pin
// for a short summary, its card, or Google Maps. Streets from OpenStreetMap (free, no key);
// this file and the map library load only when the map is opened, so the rest stays fast.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Icon, Seg } from '../ui'
import { places, tripPlaces } from '../lib/data'
import { open } from '../lib/nav'
import { createStore } from '../lib/store'
import { groupOf, type Group } from '../lib/groups'
import { GROUP_COLOR, GROUP_LIST } from '../lib/groupStyle'
import { tripDays } from '../lib/planner'
import { price } from '../lib/money'
import { legText } from '../lib/geo'
import { travelFrom } from '../lib/routes'
import { here, locate } from '../lib/here'
import type { Place, Trip } from '../lib/model'

const COLOR = GROUP_COLOR

interface MapFilters { which: 'all' | 'picked' | 'maybe'; off: Group[]; day: number | 'any' | 'none'; must: boolean; free: boolean; kids: boolean }
const DEFAULT: MapFilters = { which: 'all', off: [], day: 'any', must: false, free: false, kids: false }
const mapFilters = createStore<MapFilters>(DEFAULT, 'mapfilters')
/** Filters come first the first time the map is opened; after that, straight to the map. */
let filtered = false

function visible(all: Place[], f: MapFilters): Place[] {
  return all.filter((p) => p.status !== 'out' && !p.scoring && !(p.booked && p.kind === 'other')
    && (f.which === 'all' || p.status === f.which)
    && !f.off.includes(groupOf(p))
    && (f.day === 'any' || (f.day === 'none' ? p.day == null : p.day === f.day))
    && (!f.must || p.must) && (!f.free || p.price === 0) && (!f.kids || p.sub.kid >= 7))
}

const pinIcon = (p: Place, selected: boolean) => L.divIcon({
  className: '',
  html: `<span class="pin${p.status === 'picked' ? ' on' : ''}${selected ? ' sel' : ''}" style="--c:${COLOR[groupOf(p)]}">${p.must ? '★' : ''}</span>`,
  iconSize: [28, 28], iconAnchor: [14, 14],
})

export function MapView({ trip }: { trip: Trip }) {
  const ps = places.use()
  const f = mapFilters.use()
  const loc = here.use()
  const all = useMemo(() => tripPlaces(trip.id), [ps, trip.id])
  const shown = useMemo(() => visible(all, f), [all, f])
  const [panel, setPanel] = useState(!filtered)
  const [sel, setSel] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)
  const set = (patch: Partial<MapFilters>) => mapFilters.set({ ...f, ...patch })
  useEffect(() => { void locate() }, [])

  // The map itself, once.
  useEffect(() => {
    if (!box.current) return
    const m = L.map(box.current, { zoomControl: false, attributionControl: true, zoomSnap: 0.25 })
    m.attributionControl.setPrefix(false)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m)
    L.control.zoom({ position: 'topright' }).addTo(m)
    m.setView([trip.base?.lat ?? trip.dest.lat, trip.base?.lng ?? trip.dest.lng], 12)
    m.on('click', () => setSel(null))
    layer.current = L.layerGroup().addTo(m)
    map.current = m
    return () => { m.remove(); map.current = null }
  }, [])

  // Pins: places that pass the filters, the home base, and you.
  useEffect(() => {
    const g = layer.current
    if (!g) return
    g.clearLayers()
    for (const p of shown) {
      L.marker([p.lat, p.lng], { icon: pinIcon(p, p.id === sel), title: p.name, keyboard: true, zIndexOffset: p.id === sel ? 1000 : p.must ? 500 : 0 })
        .on('click', (e) => { L.DomEvent.stopPropagation(e); setSel(p.id) }).addTo(g)
    }
    if (trip.base) L.marker([trip.base.lat, trip.base.lng], { icon: L.divIcon({ className: '', html: '<span class="pin home">⌂</span>', iconSize: [30, 30], iconAnchor: [15, 15] }), title: trip.base.name, interactive: false, zIndexOffset: -500 }).addTo(g)
    if (loc.pt) L.circleMarker([loc.pt.lat, loc.pt.lng], { radius: 8, color: '#fff', weight: 3, fillColor: '#1A73E8', fillOpacity: 1 }).addTo(g)
  }, [shown, sel, loc.pt?.lat, loc.pt?.lng, trip.base?.lat])

  const fit = () => {
    const m = map.current
    if (!m) return
    const pts = shown.map((p) => [p.lat, p.lng] as [number, number])
    if (pts.length === 1) m.setView(pts[0], 15)
    else if (pts.length) m.fitBounds(L.latLngBounds(pts), { padding: [28, 28], maxZoom: 15 })
  }
  // Fit the pins when the map opens and whenever "Show on map" is tapped.
  useEffect(() => { if (!panel) { filtered = true; requestAnimationFrame(() => requestAnimationFrame(() => { map.current?.invalidateSize(); fit() })) } }, [panel])

  const days = tripDays(trip)
  const counts = Object.fromEntries(GROUP_LIST.map(([g]) => [g, all.filter((p) => p.status !== 'out' && groupOf(p) === g).length]))
  const p = sel ? places.get()[sel] : undefined
  const t = p && loc.pt ? travelFrom(trip, p, loc.pt) : null
  const custom = JSON.stringify(f) !== JSON.stringify(DEFAULT)

  return (
    <>
      {panel ? (
        <div class="card card-pad stack mapfilters">
          <Seg label="Show" options={[['all', 'All'], ['picked', 'Checked'], ['maybe', 'Not checked']]} value={f.which} onChange={(v) => set({ which: v })} />
          <div class="chips">
            {GROUP_LIST.filter(([g]) => counts[g] > 0).map(([g, name, c]) => {
              const on = !f.off.includes(g)
              return <button class={`pill press${on ? ' on' : ''}`} aria-pressed={on} onClick={() => set({ off: on ? [...f.off, g] : f.off.filter((x) => x !== g) })}><span class="dot" style={{ background: c }} />{name} {counts[g]}</button>
            })}
          </div>
          <div class="strip">
            {(['any', 'none', ...Array.from({ length: days }, (_, i) => i + 1)] as MapFilters['day'][]).map((d) => (
              <button class={`pill press${f.day === d ? ' on' : ''}`} aria-pressed={f.day === d} onClick={() => set({ day: d })}>{d === 'any' ? 'Any day' : d === 'none' ? 'No day yet' : `Day ${d}`}</button>
            ))}
          </div>
          <div class="chips">
            <button class={`pill press${f.must ? ' on' : ''}`} aria-pressed={f.must} onClick={() => set({ must: !f.must })}>★ Must-sees</button>
            <button class={`pill press${f.free ? ' on' : ''}`} aria-pressed={f.free} onClick={() => set({ free: !f.free })}>Free</button>
            <button class={`pill press${f.kids ? ' on' : ''}`} aria-pressed={f.kids} onClick={() => set({ kids: !f.kids })}>Kid-friendly</button>
          </div>
          <div class="row">
            {custom && <button class="btn btn-quiet press" onClick={() => mapFilters.set(DEFAULT)}>Reset</button>}
            <button class="btn btn-primary grow press" onClick={() => setPanel(false)}>Show {shown.length} on the map</button>
          </div>
        </div>
      ) : (
        <button class="banner press" onClick={() => setPanel(true)}>
          <Icon.filter /><span class="grow small"><b>{shown.length} places</b>{custom ? ' · filtered' : ''}</span><span class="strong small">Filters</span><Icon.down />
        </button>
      )}

      <div class="mapwrap" style={panel ? { display: 'none' } : undefined}>
        <div ref={box} class="mapbox" role="application" aria-label="Map of the places" />
        {p && (
          <div class="mapcard">
            <div class="between" style={{ alignItems: 'flex-start' }}>
              <div class="stack" style={{ gap: '2px', minWidth: 0 }}>
                <b class="trunc">{p.must ? '★ ' : ''}{p.name}</b>
                <span class="muted small">Worth {p.worth} · {price(trip, p.price, false)}{t ? ` · ${t.real ? '' : '≈'}${legText(t)}` : ''}{p.day ? ` · Day ${p.day}` : ''}</span>
              </div>
              <button class="iconbtn press" aria-label="Close" onClick={() => setSel(null)}><Icon.x /></button>
            </div>
            <div class="row">
              <button class="btn btn-primary btn-sm grow press" onClick={() => open({ kind: 'card', place: p.id })}>Details</button>
              <a class="btn btn-quiet btn-sm grow press" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${p.name}, ${trip.dest.name}`)}`} target="_blank" rel="noopener">Directions<Icon.out /></a>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
