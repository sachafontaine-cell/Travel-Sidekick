// Weather from Open-Meteo (free, no key) and place search (Open-Meteo for cities, OpenStreetMap
// for hotels). Fetched in the background and cached; nothing ever waits on them.
import { createStore, DEMO } from './store'
import type { Destination, Trip } from './model'
import { currencyOf, langOf } from './money'

/** temp in °C. */
export interface Weather { date: string; temp: number; c?: true; rainAt?: number; at: number }
export const weather = createStore<Record<string, Weather>>({}, 'weather')

export async function refreshWeather(trip: Trip, date: string, hourNow: number): Promise<void> {
  if (DEMO) { weather.set({ ...weather.get(), [trip.id]: { date, temp: 20, c: true, rainAt: 16, at: Date.now() } }); return }
  const cur = weather.get()[trip.id]
  if (cur && cur.c && cur.date === date && Date.now() - cur.at < 3600000) return
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${trip.dest.lat}&longitude=${trip.dest.lng}&hourly=temperature_2m,precipitation_probability&timezone=${encodeURIComponent(trip.dest.tz)}&start_date=${date}&end_date=${date}`
    const r = await fetch(url)
    if (!r.ok) return
    const j = await r.json() as { hourly?: { time: string[]; temperature_2m: number[]; precipitation_probability: (number | null)[] } }
    const h = j.hourly
    if (!h?.time?.length) return
    const idx = Math.min(h.time.length - 1, Math.max(0, h.time.findIndex((t) => +t.slice(11, 13) >= hourNow)))
    let rainAt: number | undefined
    for (let i = Math.max(idx, 0); i < h.time.length; i++) if ((h.precipitation_probability[i] ?? 0) >= 60) { rainAt = +h.time[i].slice(11, 13); break }
    weather.set({ ...weather.get(), [trip.id]: { date, temp: Math.round(h.temperature_2m[idx]), c: true, rainAt, at: Date.now() } })
  } catch { /* offline: keep the last one */ }
}

/** Cities by name, with time zone and country (Open-Meteo geocoding). */
export async function findCity(q: string): Promise<Destination[]> {
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`)
  if (!r.ok) return []
  const j = await r.json() as { results?: { name: string; latitude: number; longitude: number; timezone: string; country_code: string; country?: string; admin1?: string }[] }
  return (j.results ?? []).map((c) => ({
    name: [c.name, c.admin1 && c.admin1 !== c.name ? c.admin1 : '', c.country].filter(Boolean).join(', '),
    lat: c.latitude, lng: c.longitude, tz: c.timezone, country: c.country_code, currency: currencyOf(c.country_code), lang: langOf(c.country_code),
  }))
}

/** A hotel or address near the destination (OpenStreetMap). */
export async function findAddress(q: string, near: Destination): Promise<{ name: string; lat: number; lng: number }[]> {
  const box = [near.lng - 0.6, near.lat + 0.4, near.lng + 0.6, near.lat - 0.4].join(',')
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&viewbox=${box}&bounded=1&q=${encodeURIComponent(q)}`)
  if (!r.ok) return []
  const j = await r.json() as { display_name: string; lat: string; lon: string }[]
  return j.map((x) => ({ name: x.display_name.split(',').slice(0, 2).join(','), lat: +x.lat, lng: +x.lon }))
}
