// Dates and times in the destination's time zone. 'YYYY-MM-DD' strings compare and sort as text.

export const pad = (n: number) => String(n).padStart(2, '0')

/** Minutes after midnight → "9:30 AM" (or "9:30" when short). */
export function clock(min: number, short = false): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440
  const h = Math.floor(m / 60), mm = m % 60
  const h12 = h % 12 || 12
  if (short) return `${h12}:${pad(mm)}`
  return `${h12}:${pad(mm)} ${h < 12 ? 'AM' : 'PM'}`
}

/** "9:30" or "13:45" → minutes. */
export function parseClock(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(s.trim())
  if (!m) return null
  const v = Number(m[1]) * 60 + Number(m[2])
  return v >= 0 && v <= 1440 ? v : null
}

export function duration(min: number): string {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60), m = min % 60
  return m ? `${h} h ${pad(m)}` : `${h} h`
}

const ms = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))
export function addDays(d: string, n: number): string {
  const t = new Date(ms(d) + n * 86400000)
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
}
export const daysBetween = (a: string, b: string) => Math.round((ms(b) - ms(a)) / 86400000)
/** 0 = Sunday. */
export const weekday = (d: string) => new Date(ms(d)).getUTCDay()
export const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const shortDate = (d: string) => `${MONTH[+d.slice(5, 7) - 1]} ${+d.slice(8, 10)}`
export function dateRange(a: string, b: string): string {
  if (a.slice(0, 7) === b.slice(0, 7)) return `${shortDate(a)} – ${+b.slice(8, 10)}`
  return `${shortDate(a)} – ${shortDate(b)}`
}

/** Today's date and the time of day in a time zone. */
export function localNow(tz: string, now = Date.now()): { date: string; min: number } {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(now))
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
    return { date: `${get('year')}-${get('month')}-${get('day')}`, min: Number(get('hour')) * 60 + Number(get('minute')) }
  } catch {
    const d = new Date(now)
    return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, min: d.getHours() * 60 + d.getMinutes() }
  }
}
