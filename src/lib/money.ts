// Prices in the destination's currency, with the home currency in parentheses: "€27 ($29)".
import type { Trip } from './model'

const fmt = (amount: number, currency: string) => {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0, minimumFractionDigits: 0 }).format(amount) } catch { return `${Math.round(amount)} ${currency}` }
}

export function price(trip: Pick<Trip, 'dest' | 'home' | 'fx'>, amount: number, each = true): string {
  if (!amount) return 'Free'
  const local = fmt(amount, trip.dest.currency) + (each ? ' pp' : '')
  if (trip.dest.currency === trip.home || !trip.fx) return local
  return `${local} (${fmt(amount * trip.fx.rate, trip.home)})`
}
/** The amount in the home currency, if it differs and the rate is known ("$125"), else in the local one. */
export const home = (trip: Pick<Trip, 'dest' | 'home' | 'fx'>, amount: number) => (trip.fx && trip.home && trip.home !== trip.dest.currency ? fmt(amount * trip.fx.rate, trip.home) : fmt(amount, trip.dest.currency))
export const short = (trip: Pick<Trip, 'dest'>, amount: number) => (amount ? fmt(amount, trip.dest.currency) : 'Free')
export const symbol = (currency: string) => fmt(0, currency).replace(/[\d.,\s]/g, '') || currency

/** Today's exchange rate (free, no key), refreshed daily. */
export async function fetchRate(from: string, to: string): Promise<number | null> {
  if (from === to) return 1
  for (const url of [`https://api.frankfurter.dev/v1/latest?base=${from}&symbols=${to}`, `https://api.frankfurter.app/latest?from=${from}&to=${to}`]) {
    try {
      const r = await fetch(url)
      if (!r.ok) continue
      const j = await r.json() as { rates?: Record<string, number> }
      const rate = j.rates?.[to]
      if (rate) return rate
    } catch { /* try the next */ }
  }
  return null
}

const EURO = 'AT BE HR CY EE FI FR DE GR IE IT LV LT LU MT NL PT SK SI ES MC SM VA AD ME XK'.split(' ')
const CUR: Record<string, string> = { US: 'USD', CA: 'CAD', MX: 'MXN', GB: 'GBP', CH: 'CHF', JP: 'JPY', AU: 'AUD', NZ: 'NZD', DK: 'DKK', SE: 'SEK', NO: 'NOK', IS: 'ISK', CZ: 'CZK', PL: 'PLN', HU: 'HUF', TR: 'TRY', TH: 'THB', CR: 'CRC', BR: 'BRL', AR: 'ARS', CL: 'CLP', PE: 'PEN', CO: 'COP', MA: 'MAD', EG: 'EGP', ZA: 'ZAR', KR: 'KRW', CN: 'CNY', HK: 'HKD', SG: 'SGD', IN: 'INR', ID: 'IDR', VN: 'VND', AE: 'AED', IL: 'ILS' }
export const currencyOf = (country: string) => (EURO.includes(country) ? 'EUR' : CUR[country] ?? 'USD')

const LANG: Record<string, string> = { FR: 'fr', BE: 'fr', MC: 'fr', CH: 'de', DE: 'de', AT: 'de', ES: 'es', MX: 'es', AR: 'es', CL: 'es', PE: 'es', CO: 'es', CR: 'es', IT: 'it', SM: 'it', VA: 'it', PT: 'pt', BR: 'pt', NL: 'nl', JP: 'ja', KR: 'ko', CN: 'zh-CN', HK: 'zh-TW', GR: 'el', TR: 'tr', TH: 'th', VN: 'vi', CZ: 'cs', PL: 'pl', HU: 'hu', HR: 'hr', DK: 'da', SE: 'sv', NO: 'no', IS: 'is', FI: 'fi', MA: 'ar', EG: 'ar', AE: 'ar', IL: 'iw', ID: 'id', IE: 'en', GB: 'en', US: 'en', CA: 'en', AU: 'en', NZ: 'en' }
export const langOf = (country: string) => LANG[country] ?? 'en'
export function langName(lang: string): string {
  try { return new Intl.DisplayNames(['en'], { type: 'language' }).of(lang) ?? lang } catch { return lang }
}
